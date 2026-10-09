#import <React/RCTBridgeModule.h>
@interface RCT_EXTERN_MODULE(NearbyQrScanner, NSObject)
RCT_EXTERN_METHOD(scan:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
