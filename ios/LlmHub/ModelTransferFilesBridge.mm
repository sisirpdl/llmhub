#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
@interface RCT_EXTERN_MODULE(ModelTransferFiles, RCTEventEmitter)
RCT_EXTERN_METHOD(pairing:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(auth:(NSString *)secret resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(sealText:(NSString *)text secret:(NSString *)secret aad:(NSString *)aad resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(openText:(NSString *)text secret:(NSString *)secret aad:(NSString *)aad resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(readChunk:(NSString *)path start:(double)start length:(double)length secret:(NSString *)secret aad:(NSString *)aad resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(writeChunk:(NSString *)path start:(double)start text:(NSString *)text secret:(NSString *)secret aad:(NSString *)aad resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(advertise:(NSString *)name port:(double)port resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(discover:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopNearby:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
