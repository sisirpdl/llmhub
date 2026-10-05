#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#import <ifaddrs.h>
#import <arpa/inet.h>
#import <sys/socket.h>
#import <unistd.h>
#import <fcntl.h>
#import <poll.h>
#import <math.h>
#import <string.h>
#import <stdlib.h>
#import <errno.h>

static BOOL privateIP(NSString *ip) {
  if (!ip) return NO;
  struct in_addr address;
  if (inet_pton(AF_INET, ip.UTF8String, &address) != 1) return NO;
  uint32_t n = ntohl(address.s_addr);
  return (n >> 24) == 10 || (n >> 24) == 127 || (n >> 16) == 0xc0a8 || (n >> 20) == 0xac1;
}
static int newSocket(void) {
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  int yes = 1; setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
  struct timeval timeout = {180, 0}; setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
  timeout.tv_sec = 10; setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
  return fd;
}
static void writeBytes(int fd, NSData *data) {
  size_t offset = 0;
  while (offset < data.length) {
    ssize_t n = send(fd, (const char *)data.bytes + offset, data.length - offset, 0);
    if (n <= 0) @throw [NSException exceptionWithName:@"LAN" reason:@"Socket write failed" userInfo:nil];
    offset += n;
  }
}
static NSString *readLine(int fd) {
  NSMutableData *data = [NSMutableData new];
  char c;
  while (YES) {
    if (recv(fd, &c, 1, 0) != 1 || data.length >= 8192) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid HTTP header" userInfo:nil];
    if (c == '\n') break;
    if (c != '\r') [data appendBytes:&c length:1];
  }
  NSString *s = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (!s) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid HTTP encoding" userInfo:nil];
  return s;
}
static NSDictionary *readHTTP(int fd) {
  NSString *first = readLine(fd); NSMutableDictionary *headers = [NSMutableDictionary new];
  NSUInteger size = first.length;
  while (YES) {
    NSString *line = readLine(fd); size += line.length;
    if (size >= 16384) @throw [NSException exceptionWithName:@"LAN" reason:@"Headers too large" userInfo:nil];
    if (!line.length) break;
    NSRange colon = [line rangeOfString:@":"];
    if (colon.location == NSNotFound) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid header" userInfo:nil];
    NSString *key = [[line substringToIndex:colon.location] lowercaseString];
    if (headers[key]) @throw [NSException exceptionWithName:@"LAN" reason:@"Duplicate header" userInfo:nil];
    headers[key] = [[line substringFromIndex:colon.location + 1] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
  }
  NSString *length = headers[@"content-length"] ?: @"0";
  NSScanner *scanner = [NSScanner scannerWithString:length]; long long count;
  if (headers[@"transfer-encoding"] || ![scanner scanLongLong:&count] || !scanner.isAtEnd || count < 0 || count > 1048576)
    @throw [NSException exceptionWithName:@"LAN" reason:@"Unsupported body length" userInfo:nil];
  NSMutableData *body = [NSMutableData dataWithLength:(NSUInteger)count]; size_t offset = 0;
  while (offset < body.length) {
    ssize_t n = recv(fd, (char *)body.mutableBytes + offset, body.length - offset, 0);
    if (n <= 0) @throw [NSException exceptionWithName:@"LAN" reason:@"Incomplete HTTP body" userInfo:nil];
    offset += n;
  }
  NSString *text = [[NSString alloc] initWithData:body encoding:NSUTF8StringEncoding];
  if (!text) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid body encoding" userInfo:nil];
  return @{ @"first":first, @"headers":headers, @"body":text };
}
static void reply(int fd, NSInteger status, NSString *body) {
  NSData *bytes = [body dataUsingEncoding:NSUTF8StringEncoding];
  NSString *header = [NSString stringWithFormat:@"HTTP/1.1 %ld Response\r\nContent-Type: application/json\r\nContent-Length: %lu\r\nConnection: close\r\n\r\n", (long)status, (unsigned long)bytes.length];
  writeBytes(fd, [header dataUsingEncoding:NSUTF8StringEncoding]); writeBytes(fd, bytes);
}
@interface LanHttp : RCTEventEmitter <RCTBridgeModule>
@end
@implementation LanHttp {
  int _listener;
  NSString *_key;
  NSMutableDictionary<NSString *, NSNumber *> *_peers;
  NSMutableDictionary<NSString *, NSNumber *> *_clients;
}
RCT_EXPORT_MODULE(LanHttp)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (NSArray<NSString *> *)supportedEvents { return @[@"LanRequest", @"LanStopped", @"LanCancelled"]; }
- (instancetype)init { if ((self = [super init])) { _listener = -1; _peers = [NSMutableDictionary new]; _clients = [NSMutableDictionary new]; } return self; }
- (void)endSession {
  @synchronized(self) {
    if (_listener >= 0) { shutdown(_listener, SHUT_RDWR); close(_listener); _listener = -1; }
    _key = nil;
    // Workers own close(); shutdown wakes pending reads without descriptor reuse races.
    for (NSNumber *fd in _peers.allValues) shutdown(fd.intValue, SHUT_RDWR);
    for (NSNumber *fd in _clients.allValues) shutdown(fd.intValue, SHUT_RDWR);
  }
}
RCT_REMAP_METHOD(start, startPort:(double)port resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  @synchronized(self) {
    if (_listener >= 0 || port < 1024 || port > 65535 || floor(port) != port) { reject(@"LAN_START", @"Already hosting or invalid port.", nil); return; }
    struct ifaddrs *interfaces = NULL; NSString *ip = nil;
    if (getifaddrs(&interfaces) == 0) {
      for (struct ifaddrs *p = interfaces; p; p = p->ifa_next) {
        if (p->ifa_addr && p->ifa_addr->sa_family == AF_INET && strcmp(p->ifa_name, "en0") == 0) {
          char buffer[INET_ADDRSTRLEN]; inet_ntop(AF_INET, &((struct sockaddr_in *)p->ifa_addr)->sin_addr, buffer, sizeof(buffer));
          NSString *candidate = [NSString stringWithUTF8String:buffer]; if (privateIP(candidate)) { ip = candidate; break; }
        }
      }
      freeifaddrs(interfaces);
    }
    if (!ip) { reject(@"LAN_START", @"Connect this phone to Wi-Fi before hosting.", nil); return; }
    int fd = newSocket(); int yes = 1; setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    struct sockaddr_in address = {}; address.sin_family = AF_INET; address.sin_port = htons((uint16_t)port); inet_pton(AF_INET, ip.UTF8String, &address.sin_addr);
    if (bind(fd, (struct sockaddr *)&address, sizeof(address)) != 0 || listen(fd, 4) != 0) { close(fd); reject(@"LAN_START", @"Cannot listen on this Wi-Fi address. Port 8080 may be in use.", nil); return; }
    _listener = fd;
    unsigned char random[24]; arc4random_buf(random, sizeof(random)); NSMutableString *key = [NSMutableString new];
    for (int i = 0; i < 24; i++) [key appendFormat:@"%02x", random[i]];
    _key = key;
    NSString *session = NSUUID.UUID.UUIDString;
    resolve(@{@"url":[NSString stringWithFormat:@"http://%@:%d", ip, (int)port], @"token":key, @"session":session});
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
      while (YES) {
        @synchronized(self) { if (![self->_key isEqual:key]) break; }
        int socket = accept(fd, NULL, NULL);
        if (socket < 0) break;
        NSString *identifier = NSUUID.UUID.UUIDString;
        @synchronized(self) {
          if (![self->_key isEqual:key] || self->_peers.count >= 4) { close(socket); continue; }
          self->_peers[identifier] = @(socket);
        }
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
          BOOL cancelled = NO;
          @try {
            int yes = 1; setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &yes, sizeof(yes));
            struct timeval timeout = {10, 0}; setsockopt(socket, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
            setsockopt(socket, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
            NSDictionary *http = readHTTP(socket); NSArray *parts = [http[@"first"] componentsSeparatedByString:@" "];
            if (parts.count != 3 || ![parts[2] isEqual:@"HTTP/1.1"]) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid request" userInfo:nil];
            if (![http[@"headers"][@"authorization"] isEqual:[@"Bearer " stringByAppendingString:key]]) {
              reply(socket, 401, @"{\"error\":{\"message\":\"Access key required\"}}");
            } else {
              [self sendEventWithName:@"LanRequest" body:@{@"id":identifier, @"session":session, @"method":parts[0], @"path":parts[1], @"body":http[@"body"]}];
              // A worker owns this descriptor until respond removes it, or timeout/stop.
              for (int i = 0; i < 1800; i++) {
                @synchronized(self) {
                  if (!self->_peers[identifier]) return;
                  if (![self->_key isEqual:key]) break;
                  char byte; ssize_t n = recv(socket, &byte, 1, MSG_PEEK | MSG_DONTWAIT);
                  if (n == 0 || (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) { cancelled = YES; break; }
                }
                usleep(100000);
              }
            }
          } @catch (NSException *exception) {}
          @synchronized(self) { if (self->_peers[identifier]) { [self->_peers removeObjectForKey:identifier]; close(socket); if (cancelled) [self sendEventWithName:@"LanCancelled" body:@{@"id":identifier}]; } }
        });
      }
      @synchronized(self) { if ([self->_key isEqual:key]) { close(fd); self->_listener = -1; [self sendEventWithName:@"LanStopped" body:@{}]; } }
    });
  }
}
RCT_REMAP_METHOD(respond, respondID:(NSString *)identifier status:(double)status body:(NSString *)body resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSNumber *number; @synchronized(self) { number = self->_peers[identifier]; [self->_peers removeObjectForKey:identifier]; }
    if (number) { @try { reply(number.intValue, (NSInteger)status, body); } @catch (NSException *exception) {} close(number.intValue); }
    resolve(nil);
  });
}
RCT_REMAP_METHOD(stop, stopResolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) { [self endSession]; resolve(nil); }
RCT_REMAP_METHOD(request, requestID:(NSString *)identifier url:(NSString *)url token:(NSString *)token method:(NSString *)method body:(NSString *)body resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSURL *parsed = [NSURL URLWithString:url];
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:@"^[a-f0-9]{48}$" options:0 error:nil];
  NSData *bytes = [body dataUsingEncoding:NSUTF8StringEncoding];
  if (![parsed.scheme isEqual:@"http"] || !privateIP(parsed.host) || parsed.user || parsed.password || parsed.port.intValue < 1024 || parsed.port.intValue > 65535 || ![@[@"GET", @"POST"] containsObject:method] || ![regex numberOfMatchesInString:token options:0 range:NSMakeRange(0, token.length)] || bytes.length > 1048576) { reject(@"LAN_REQUEST", @"Invalid private LAN address, key, or request.", nil); return; }
  int fd = newSocket(); @synchronized(self) { _clients[identifier] = @(fd); }
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @try {
      struct sockaddr_in address = {}; address.sin_family = AF_INET; address.sin_port = htons(parsed.port.intValue); inet_pton(AF_INET, parsed.host.UTF8String, &address.sin_addr);
      fcntl(fd, F_SETFL, O_NONBLOCK);
      int result = connect(fd, (struct sockaddr *)&address, sizeof(address));
      if (result != 0) {
        struct pollfd item = {fd, POLLOUT, 0}; int error = 0; socklen_t length = sizeof(error);
        if (poll(&item, 1, 5000) <= 0 || getsockopt(fd, SOL_SOCKET, SO_ERROR, &error, &length) != 0 || error != 0) @throw [NSException exceptionWithName:@"LAN" reason:@"Connection failed" userInfo:nil];
      }
      fcntl(fd, F_SETFL, 0);
      NSString *header = [NSString stringWithFormat:@"%@ %@ HTTP/1.1\r\nHost: %@:%@\r\nAuthorization: Bearer %@\r\nContent-Type: application/json\r\nContent-Length: %lu\r\nConnection: close\r\n\r\n", method, parsed.path, parsed.host, parsed.port, token, (unsigned long)bytes.length];
      writeBytes(fd, [header dataUsingEncoding:NSUTF8StringEncoding]); writeBytes(fd, bytes);
      NSDictionary *response = readHTTP(fd); NSArray *parts = [response[@"first"] componentsSeparatedByString:@" "];
      if (parts.count < 2) @throw [NSException exceptionWithName:@"LAN" reason:@"Invalid response" userInfo:nil];
      resolve(@{@"status":@([parts[1] integerValue]), @"body":response[@"body"]});
    } @catch (NSException *exception) { reject(@"LAN_REQUEST", @"LAN request failed. Check Wi-Fi, address, access key, local network permission, and that the host is open.", nil); }
    @synchronized(self) { [self->_clients removeObjectForKey:identifier]; close(fd); }
  });
}
RCT_EXPORT_METHOD(cancel:(NSString *)identifier) { @synchronized(self) { NSNumber *fd = _clients[identifier]; if (fd) shutdown(fd.intValue, SHUT_RDWR); } }
- (void)invalidate { [self endSession]; [super invalidate]; }
@end
