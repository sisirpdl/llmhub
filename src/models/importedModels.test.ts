import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import { keepLocalCopy } from '@react-native-documents/picker';
import {
  downloadImport,
  fromHub,
  fromRemote,
  importLocal,
  readImportedModels,
  saveImportedModels,
  validateRemoteUrl,
} from './importedModels';
import type { HubDetails } from './huggingFace';
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    getFSInfo: jest.fn().mockResolvedValue({ freeSpace: 10_000_000_000 }),
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1000 }),
    read: jest.fn().mockResolvedValue('R0dVRg=='),
    moveFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    downloadFile: jest.fn(),
    stopDownload: jest.fn(),
  },
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { hash: jest.fn().mockResolvedValue('b'.repeat(64)) } },
}));
jest.mock('@react-native-documents/picker', () => ({
  keepLocalCopy: jest
    .fn()
    .mockResolvedValue([
      { status: 'success', localUri: 'file:///cache/file.gguf' },
    ]),
}));
beforeEach(() => {
  jest.clearAllMocks();
  (RNFS.exists as jest.Mock).mockResolvedValue(false);
  (RNFS.read as jest.Mock).mockResolvedValue('R0dVRg==');
  (RNFS.getFSInfo as jest.Mock).mockResolvedValue({
    freeSpace: 10_000_000_000,
  });
  (RNBlobUtil.fs.hash as jest.Mock).mockResolvedValue('b'.repeat(64));
  (RNFS.downloadFile as jest.Mock).mockReturnValue({
    jobId: 1,
    promise: Promise.resolve({ statusCode: 200 }),
  });
});
test('validates remote inputs and owns the imported file name', () => {
  expect(() => validateRemoteUrl('http://host/model.gguf')).toThrow('HTTPS');
  expect(() =>
    validateRemoteUrl('https://user:secret@host/model.gguf'),
  ).toThrow('credentials');
  expect(() =>
    fromRemote('Model', 'https://host/model.gguf', 'invalid'),
  ).toThrow('SHA-256');
  const model = fromRemote('../unsafe', 'https://host/model.gguf', '');
  expect(model.fileName).toMatch(/^import-[a-z0-9-]+\.gguf$/);
  expect(model.promptTemplateId).toBe('native');
  expect(
    fromRemote('', 'https://host/model.gguf?download=true', '').displayName,
  ).toBe('model');
});
test('round trips imports but rejects paths outside app storage', async () => {
  const model = fromRemote('Model', 'https://host/model.gguf', '');
  await saveImportedModels([model]);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify([model]),
  );
  expect(await readImportedModels()).toEqual([model]);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify([{ ...model, fileName: '../../other.gguf' }]),
  );
  await expect(readImportedModels()).rejects.toThrow('restored');
});
test('checks GGUF magic and checksum before committing, and sends no HF token to remote URLs', async () => {
  const model = fromRemote(
    'Model',
    'https://host/model.gguf',
    'b'.repeat(64),
    1000,
  );
  const verified = await downloadImport(
    model,
    jest.fn(),
    jest.fn(),
    'hf_secret',
  );
  expect(verified.sha256).toBe('b'.repeat(64));
  expect(RNFS.downloadFile).toHaveBeenCalledWith(
    expect.objectContaining({ headers: undefined }),
  );
  expect(RNFS.moveFile).toHaveBeenCalled();
  (RNFS.moveFile as jest.Mock).mockClear();
  (RNFS.read as jest.Mock).mockResolvedValue('PGh0bWw=');
  await expect(downloadImport(model, jest.fn(), jest.fn())).rejects.toThrow(
    'not a GGUF',
  );
  expect(RNFS.moveFile).not.toHaveBeenCalled();
});
test('rolls back a download after checksum mismatch and avoids downloads without storage', async () => {
  const model = fromRemote(
    'Model',
    'https://host/model.gguf',
    'a'.repeat(64),
    1000,
  );
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  await expect(downloadImport(model, jest.fn(), jest.fn())).rejects.toThrow(
    'Checksum',
  );
  expect(RNFS.unlink).toHaveBeenCalledWith(expect.stringContaining('.part'));
  expect(RNFS.moveFile).not.toHaveBeenCalled();
  (RNFS.downloadFile as jest.Mock).mockClear();
  (RNFS.getFSInfo as jest.Mock).mockResolvedValue({ freeSpace: 100 });
  await expect(downloadImport(model, jest.fn(), jest.fn())).rejects.toThrow(
    'storage',
  );
  expect(RNFS.downloadFile).not.toHaveBeenCalled();
});
test('pins Hugging Face files and attaches a selected vision projector', () => {
  const detail: HubDetails = {
    model: {
      id: 'org/model',
      author: 'org',
      name: 'model',
      downloads: 0,
      likes: 0,
      gated: false,
      vision: true,
    },
    revision: 'a'.repeat(40),
    license: 'mit',
    files: [],
  };
  const file = {
    path: 'model-Q4_K_M.gguf',
    size: 1000,
    sha256: 'b'.repeat(64),
    projector: false,
    split: false,
    quantization: 'Q4_K_M',
  };
  expect(
    fromHub(detail, file, { ...file, path: 'mmproj.gguf', projector: true }),
  ).toMatchObject({
    kind: 'vision',
    promptTemplateId: 'native',
    projectorByteSize: 1000,
  });
  expect(() => fromHub(detail, { ...file, split: true })).toThrow('split');
});
test('copies local files and records real sizes and hashes', async () => {
  const model = await importLocal(
    { uri: 'content://picker/file', name: 'Model.gguf', size: 1000 },
    { uri: 'content://picker/projector', name: 'mmproj.gguf', size: 1000 },
  );
  expect(keepLocalCopy).toHaveBeenCalledTimes(2);
  expect(model).toMatchObject({
    origin: 'local',
    byteSize: 1000,
    sha256: 'b'.repeat(64),
    kind: 'vision',
    projectorSha256: 'b'.repeat(64),
  });
  expect(RNFS.writeFile).toHaveBeenCalled();
});
