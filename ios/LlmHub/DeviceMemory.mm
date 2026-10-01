#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>
#import <os/proc.h>
#import <mach/mach.h>

@interface DeviceMemory : NSObject <RCTBridgeModule>
@end
@implementation DeviceMemory
RCT_EXPORT_MODULE(DeviceMemory)
+ (BOOL)requiresMainQueueSetup { return NO; }
RCT_REMAP_METHOD(getMemoryInfo, resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  uint64_t total = NSProcessInfo.processInfo.physicalMemory;
  uint64_t available = os_proc_available_memory();
  struct task_vm_info info = {};
  mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
  uint64_t footprint = task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&info, &count) == KERN_SUCCESS ? info.phys_footprint : 0;
  double budget = MAX(0.0, MIN(total * 0.60, (double)available + footprint - 384.0 * 1024 * 1024));
  resolve(@{@"totalBytes": @(total), @"availableBytes": @(available), @"appBudgetBytes": @(budget)});
}
@end
