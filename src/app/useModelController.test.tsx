jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
import React from 'react';
import Renderer from 'react-test-renderer';
import { AppState } from 'react-native';
import { initLlama } from 'llama.rn';
import {
  useModelController,
  CATALOG,
  type ModelController,
} from './useModelController';
import { downloadVerifiedArtifact } from '../models/modelStore';
import { SUPPORTED_VISION_MODELS } from '../models/visionCatalog';
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(),
  getBackendDevicesInfo: jest.fn().mockResolvedValue([]),
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { exists: jest.fn().mockResolvedValue(false) },
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { hash: jest.fn() } },
}));
jest.mock('../models/modelStore', () => ({
  getAvailableSpace: jest.fn().mockResolvedValue(10_000_000_000),
  isModelReady: jest.fn().mockResolvedValue(true),
  modelPath: (model: { fileName: string }) => `/models/${model.fileName}`,
  artifactPath: (file: string) => `/models/${file}`,
  downloadModel: jest.fn().mockResolvedValue(undefined),
  downloadVerifiedArtifact: jest.fn().mockResolvedValue('projector'),
  deleteModel: jest.fn(),
}));
let models: ModelController;
function Harness() {
  models = useModelController();
  return null;
}
const context = () => ({
  completion: jest.fn().mockResolvedValue({ text: 'READY' }),
  stopCompletion: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  initMultimodal: jest.fn().mockResolvedValue(true),
});
let renderer: Renderer.ReactTestRenderer;
let lifecycle: (state: string) => void;
beforeEach(async () => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    event: string,
    callback: (state: string) => void,
  ) => {
    if (event === 'change') lifecycle = callback;
    return { remove: jest.fn() };
  }) as never);
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness />);
  });
});
afterEach(async () => {
  await Renderer.act(async () => renderer.unmount());
  jest.restoreAllMocks();
});
test('releases the previous model before initializing a replacement', async () => {
  const first = context(),
    second = context();
  (initLlama as jest.Mock)
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(async () => {
      expect(first.release).toHaveBeenCalledTimes(1);
      return second;
    });
  await Renderer.act(async () => {
    await models.load(CATALOG[0]);
  });
  await Renderer.act(async () => {
    await models.load(CATALOG[1]);
  });
  expect(models.model.id).toBe(CATALOG[1].id);
  expect(models.context).toBe(second);
});
test('uses a load-failed state so retry does not redownload a valid GGUF', async () => {
  (initLlama as jest.Mock).mockRejectedValueOnce(
    new Error('Not enough memory'),
  );
  await Renderer.act(async () => {
    await models.load(CATALOG[0]);
  });
  expect(models.states[CATALOG[0].id]).toBe('load-failed');
  expect(models.errors[CATALOG[0].id]).toBe('Not enough memory');
});
test('stops and releases an active context on background', async () => {
  const active = context();
  (initLlama as jest.Mock).mockResolvedValueOnce(active);
  await Renderer.act(async () => {
    await models.load(CATALOG[0]);
  });
  await Renderer.act(async () => {
    lifecycle('background');
  });
  expect(active.stopCompletion).toHaveBeenCalledTimes(1);
  expect(active.release).toHaveBeenCalledTimes(1);
  expect(models.context).toBeNull();
  expect(models.states[CATALOG[0].id]).toBe('ready');
});
test('discards a load completed after the app leaves the foreground', async () => {
  const active = context();
  let resolve: (value: unknown) => void = () => {};
  (initLlama as jest.Mock).mockImplementationOnce(
    () =>
      new Promise(r => {
        resolve = r;
      }),
  );
  let loading: Promise<boolean>;
  await Renderer.act(async () => {
    loading = models.load(CATALOG[0]);
  });
  await Renderer.act(async () => {
    lifecycle('background');
    resolve(active);
    await loading;
  });
  expect(active.release).toHaveBeenCalledTimes(1);
  expect(models.context).toBeNull();
});
test('downloads the declared vision projector as a separate verified artifact', async () => {
  await Renderer.act(async () => {
    await models.download(CATALOG[1]);
  });
  const vision = SUPPORTED_VISION_MODELS[0];
  expect(downloadVerifiedArtifact).toHaveBeenCalledWith(
    expect.objectContaining({
      fileName: vision.projectorFileName,
      url: vision.projectorUrl,
      sha256: vision.projectorSha256,
      byteSize: vision.projectorByteSize,
    }),
    expect.any(Function),
  );
});

test('loads the selected context length and clears it on offload', async () => {
  const native = context();
  (initLlama as jest.Mock).mockResolvedValue(native);
  await Renderer.act(async () => {
    expect(await models.load(CATALOG[0], 4096)).toBe(true);
  });
  expect(initLlama).toHaveBeenCalledWith(
    expect.objectContaining({ n_ctx: 4096 }),
  );
  expect(models.loadedContextLength).toBe(4096);
  await Renderer.act(async () => {
    await models.offload();
  });
  expect(models.loadedContextLength).toBeNull();
});
test('keeps the model loaded while the native image picker is open', async () => {
  const native = context();
  (initLlama as jest.Mock).mockResolvedValue(native);
  await Renderer.act(async () => {
    await models.load(CATALOG[0]);
  });
  await Renderer.act(async () => {
    models.setExternalUIActive(true);
    lifecycle('background');
  });
  expect(native.release).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    models.setExternalUIActive(false);
  });
  expect(native.release).toHaveBeenCalled();
});
