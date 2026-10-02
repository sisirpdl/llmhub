#import <React/RCTBridgeModule.h>
#import <PDFKit/PDFKit.h>
#import <math.h>

@interface PdfText : NSObject <RCTBridgeModule>
@end

@implementation PdfText {
  NSMutableDictionary<NSString *, PDFDocument *> *_documents;
  dispatch_queue_t _worker;
}
RCT_EXPORT_MODULE(PdfText)
+ (BOOL)requiresMainQueueSetup { return NO; }
- (instancetype)init {
  if ((self = [super init])) {
    _documents = [NSMutableDictionary new];
    _worker = dispatch_queue_create("com.llmhub.pdftext", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}
- (dispatch_queue_t)methodQueue { return _worker; }

RCT_REMAP_METHOD(open, openID:(NSString *)session path:(NSString *)path
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  @try {
    NSString *local = path.stringByResolvingSymlinksInPath;
    NSString *documents = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject.stringByResolvingSymlinksInPath;
    NSString *caches = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject.stringByResolvingSymlinksInPath;
    BOOL privatePath = [local hasPrefix:[documents stringByAppendingString:@"/"]] ||
                       [local hasPrefix:[caches stringByAppendingString:@"/"]];
    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:local error:nil];
    if (!privatePath || !attributes || [attributes fileSize] > 50ULL * 1024 * 1024) {
      reject(@"PDF_OPEN_FAILED", @"Choose a local PDF smaller than 50 MB.", nil); return;
    }
    if (_documents.count) { reject(@"PDF_BUSY", @"Another PDF is being imported.", nil); return; }
    PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:local]];
    if (!document) { reject(@"PDF_CORRUPT", @"This PDF could not be read. It may be corrupt.", nil); return; }
    if (document.isEncrypted || document.isLocked) {
      reject(@"PDF_LOCKED", @"Password-protected PDFs are not supported. Import an unlocked copy.", nil); return;
    }
    if (!document.allowsCopying) { reject(@"PDF_RESTRICTED", @"This PDF does not permit text extraction.", nil); return; }
    if (document.pageCount < 1 || document.pageCount > 300) {
      reject(@"PDF_LIMIT", @"PDFs must contain between 1 and 300 pages.", nil); return;
    }
    _documents[session] = document;
    resolve(@(document.pageCount));
  } @catch (NSException *exception) { reject(@"PDF_OPEN_FAILED", @"This PDF could not be read.", nil); }
}
RCT_REMAP_METHOD(page, pageID:(NSString *)session index:(double)index
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  @autoreleasepool {
    @try {
      PDFDocument *document = _documents[session];
      if (!document || index < 0 || index >= document.pageCount || floor(index) != index) {
        reject(@"PDF_TEXT_FAILED", @"PDF import session or page is invalid.", nil); return;
      }
      NSString *text = [document pageAtIndex:(NSUInteger)index].string ?: @"";
      if (text.length > 250000) { reject(@"PDF_LIMIT", @"A PDF page contains too much text.", nil); return; }
      resolve(text);
    } @catch (NSException *exception) { reject(@"PDF_TEXT_FAILED", @"A PDF page could not be read.", nil); }
  }
}
RCT_REMAP_METHOD(close, closeID:(NSString *)session
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  [_documents removeObjectForKey:session];
  resolve(nil);
}
- (void)invalidate { dispatch_async(_worker, ^{ [self->_documents removeAllObjects]; }); }
@end
