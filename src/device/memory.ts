import { NativeModules } from 'react-native';
export type DeviceMemory = {
  totalBytes: number;
  availableBytes: number;
  appBudgetBytes: number;
};
export async function readDeviceMemory(): Promise<DeviceMemory | null> {
  try {
    const value = await NativeModules.DeviceMemory?.getMemoryInfo();
    return value &&
      ['totalBytes', 'availableBytes', 'appBudgetBytes'].every(
        key => Number.isFinite(value[key]) && value[key] >= 0,
      )
      ? value
      : null;
  } catch {
    return null;
  }
}
