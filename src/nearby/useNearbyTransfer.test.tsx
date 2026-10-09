import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const mockSession = {
  connect: jest.fn(async () => {}),
  receive: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
  handle: jest.fn(async () => {}),
  share: jest.fn(),
  discard: jest.fn(),
};
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    AppState: actual.AppState,
    NativeModules: {
      NearbyQrScanner: { scan: jest.fn() },
    },
    NativeEventEmitter: class {
      addListener() {
        return { remove: () => {} };
      }
    },
  };
});
jest.mock('./native', () => ({
  files: { discover: jest.fn(async () => {}) },
  http: {},
}));
jest.mock('./session', () => ({ NearbySession: jest.fn(() => mockSession) }));
import { AppState, NativeModules } from 'react-native';
const mockScan = NativeModules.NearbyQrScanner.scan as jest.Mock;
import { useNearbyTransfer } from './useNearbyTransfer';
import { encodePairing } from './pairing';
let transfer: ReturnType<typeof useNearbyTransfer>;
const model = {
  setNotice: jest.fn(),
  registerReceived: jest.fn(),
  states: {},
  generationActive: false,
  importing: false,
} as any;
function Harness() {
  transfer = useNearbyTransfer(model);
  return null;
}
let renderer: Renderer.ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
  });
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});
test('scanning fills credentials and reviews the offer without downloading', async () => {
  const address = 'http://192.168.1.10:8081',
    key = 'b'.repeat(48);
  mockScan.mockResolvedValue(encodePairing(address, key));
  await act(async () => {
    await transfer.scan();
  });
  expect(transfer.address).toBe(address);
  expect(transfer.key).toBe(key);
  expect(mockSession.connect).toHaveBeenCalledWith(address, key);
  expect(mockSession.receive).not.toHaveBeenCalled();
  expect(transfer.scanning).toBe(false);
});
test('invalid codes and cancelled scans never connect', async () => {
  mockScan.mockResolvedValue('https://unrelated.example');
  await act(async () => {
    await transfer.scan();
  });
  expect(transfer.scanError).toContain('not an LLMHub');
  expect(mockSession.connect).not.toHaveBeenCalled();
  mockScan.mockResolvedValue(null);
  await act(async () => {
    await transfer.scan();
  });
  expect(mockSession.connect).not.toHaveBeenCalled();
  expect(transfer.scanError).toBe('');
});
test('camera denial surfaces a recoverable error', async () => {
  mockScan.mockRejectedValue(new Error('Camera permission denied'));
  await act(async () => {
    await transfer.scan();
  });
  expect(transfer.scanError).toBe('Camera permission denied');
  expect(mockSession.connect).not.toHaveBeenCalled();
  expect(transfer.scanning).toBe(false);
});
test('closing invalidates a late scan result', async () => {
  let resolve: (value: string) => void;
  mockScan.mockImplementationOnce(
    () =>
      new Promise<string>(done => {
        resolve = done;
      }),
  );
  let pending: Promise<void>;
  await act(async () => {
    pending = transfer.scan();
    await Promise.resolve();
  });
  await act(async () => {
    await transfer.close();
  });
  await act(async () => {
    resolve!(encodePairing('http://192.168.1.10:8081', 'a'.repeat(48)));
    await pending!;
  });
  expect(mockSession.connect).not.toHaveBeenCalled();
  expect(transfer.key).toBe('');
});
