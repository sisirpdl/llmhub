package com.llmhub

import android.app.ActivityManager
import android.content.Context
import android.os.Process
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.uimanager.ViewManager

@ReactModule(name = DeviceMemoryModule.NAME)
class DeviceMemoryModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  companion object { const val NAME = "DeviceMemory" }
  override fun getName() = NAME
  @ReactMethod
  fun getMemoryInfo(promise: Promise) {
    try {
      val manager = reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val info = ActivityManager.MemoryInfo()
      manager.getMemoryInfo(info)
      val reclaimable = manager.getProcessMemoryInfo(intArrayOf(Process.myPid())).firstOrNull()?.totalPss?.toLong()?.times(1024) ?: 0L
      // Keep OS low-memory headroom and cap the app below total physical memory.
      val budget = minOf((info.totalMem * 0.60).toLong(), info.availMem + reclaimable - maxOf(info.threshold, 384L * 1024 * 1024)).coerceAtLeast(0)
      promise.resolve(Arguments.createMap().apply {
        putDouble("totalBytes", info.totalMem.toDouble())
        putDouble("availableBytes", info.availMem.toDouble())
        putDouble("appBudgetBytes", budget.toDouble())
      })
    } catch (error: Exception) { promise.reject("MEMORY_UNAVAILABLE", "Unable to read device memory.", error) }
  }
}
class DeviceMemoryPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(DeviceMemoryModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
