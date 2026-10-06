import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHUNK_BYTES } from './protocol';
import {
  discardPartial,
  finish,
  loadCheckpoint,
  offsets,
  prepare,
  receivedModel,
  verifyGGUF,
  type Checkpoint,
} from './storage';
import { SUPPORTED_MODELS } from '../models/modelCatalog';
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    exists: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    read: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn(),
    getFSInfo: jest.fn(),
    moveFile: jest.fn(),
    unlink: jest.fn(),
    readDir: jest.fn(),
  },
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { hash: jest.fn() } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn() },
}));
const checkpoint: Checkpoint = {
  version: 1,
  id: 'import-123-abc',
  offer: {
    version: 1,
    id: 'a'.repeat(48),
    name: 'Peer model',
    license: 'Unverified license',
    contextLength: 2048,
    artifacts: [
      { name: 'test.gguf', size: CHUNK_BYTES + 8, sha256: 'b'.repeat(64) },
    ],
  },
};
const partial = '/docs/incoming/import-123-abc-0.part',
  final = '/docs/models/import-123-abc.gguf',
  record = '/docs/incoming/transfer.json';
let present: Set<string>;
beforeEach(() => {
  jest.clearAllMocks();
  present = new Set([record, partial]);
  (RNFS.exists as jest.Mock).mockImplementation(async path =>
    present.has(path),
  );
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(checkpoint));
  (RNFS.moveFile as jest.Mock).mockImplementation(async (a, b) => {
    present.delete(a);
    present.add(b);
  });
  (RNFS.unlink as jest.Mock).mockImplementation(async path => {
    present.delete(path);
  });
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: CHUNK_BYTES });
  (RNFS.getFSInfo as jest.Mock).mockResolvedValue({
    freeSpace: 10 * 1024 ** 3,
  });
  (RNFS.read as jest.Mock).mockResolvedValue('R0dVRg==');
  (RNBlobUtil.fs.hash as jest.Mock).mockResolvedValue('b'.repeat(64));
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});
test('resume keeps only identical byte identities and checks remaining storage', async () => {
  const result = await prepare({ ...checkpoint.offer, id: 'c'.repeat(48) });
  expect(result.id).toBe(checkpoint.id);
  expect(await offsets(result)).toEqual([CHUNK_BYTES]);
  await expect(
    prepare({
      ...checkpoint.offer,
      artifacts: [{ ...checkpoint.offer.artifacts[0], sha256: 'd'.repeat(64) }],
    }),
  ).rejects.toThrow('Another model');
  (RNFS.getFSInfo as jest.Mock).mockResolvedValue({
    freeSpace: 256 * 1024 ** 2 + 7,
  });
  await expect(prepare(checkpoint.offer)).rejects.toThrow('storage');
});
test('partial chunk lengths and invalid checkpoint paths are rejected', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: 1 });
  await expect(offsets(checkpoint)).rejects.toThrow('mid-chunk');
  (RNFS.readFile as jest.Mock).mockResolvedValue(
    JSON.stringify({ ...checkpoint, id: '../../secret' }),
  );
  await expect(loadCheckpoint()).rejects.toThrow('Invalid partial');
});
test('promotion registers after complete hash checks and records nearby origin', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: CHUNK_BYTES + 8 });
  const register = jest.fn(async () => {});
  const model = await finish(checkpoint, register, () => true);
  expect(model.origin).toBe('nearby');
  expect(model.checksumVerified).toBe(false);
  expect(model.sourceUrl).toBe('');
  expect(register).toHaveBeenCalledWith(model);
  expect(present.has(final)).toBe(true);
  expect(present.has(record)).toBe(false);
});
test('failed registration rolls promoted files back for resume', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: CHUNK_BYTES + 8 });
  await expect(
    finish(
      checkpoint,
      async () => {
        throw new Error('Disk full');
      },
      () => true,
    ),
  ).rejects.toThrow('Disk full');
  expect(present.has(partial)).toBe(true);
  expect(present.has(final)).toBe(false);
  expect(present.has(record)).toBe(true);
});
test('bad size, GGUF header or checksum blocks import', async () => {
  await expect(
    verifyGGUF(partial, CHUNK_BYTES + 8, 'b'.repeat(64)),
  ).rejects.toThrow('incomplete');
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: CHUNK_BYTES + 8 });
  (RNFS.read as jest.Mock).mockResolvedValue('html');
  await expect(verifyGGUF(partial, CHUNK_BYTES + 8)).rejects.toThrow('invalid');
  (RNFS.read as jest.Mock).mockResolvedValue('R0dVRg==');
  await expect(
    verifyGGUF(partial, CHUNK_BYTES + 8, 'c'.repeat(64)),
  ).rejects.toThrow('Checksum');
});
test('pause during final hashing keeps files unregistered', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: CHUNK_BYTES + 8 });
  const register = jest.fn();
  await expect(finish(checkpoint, register, () => false)).rejects.toThrow(
    'paused',
  );
  expect(register).not.toHaveBeenCalled();
  expect(RNFS.moveFile).not.toHaveBeenCalled();
});
test('interrupted promotion is recovered unless catalog registration already committed', async () => {
  present.delete(partial);
  present.add(final);
  expect(await loadCheckpoint()).toEqual(checkpoint);
  expect(present.has(partial)).toBe(true);
  expect(present.has(final)).toBe(false);
  present.add(final);
  present.delete(partial);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify([receivedModel(checkpoint)]),
  );
  expect(await loadCheckpoint()).toBeNull();
  expect(present.has(final)).toBe(true);
  expect(present.has(record)).toBe(false);
});
test('publisher trust comes from bundled hashes rather than the peer metadata', () => {
  const known = SUPPORTED_MODELS[0];
  const data = receivedModel({
    ...checkpoint,
    offer: {
      ...checkpoint.offer,
      artifacts: [
        { name: 'renamed.gguf', size: known.byteSize, sha256: known.sha256 },
      ],
    },
  });
  expect(data.checksumVerified).toBe(true);
  expect(data.license).toBe(known.license);
  expect(data.sourceUrl).toBe(known.sourceUrl);
});
test('partial deletion stays within files owned by nearby transfers', async () => {
  (RNFS.readDir as jest.Mock).mockResolvedValue([
    { name: 'transfer.json', path: record },
    { name: 'import-123-abc-0.part', path: partial },
    { name: 'other.txt', path: '/docs/incoming/other.txt' },
  ]);
  await discardPartial();
  expect(RNFS.unlink).toHaveBeenCalledTimes(2);
  expect(RNFS.unlink).not.toHaveBeenCalledWith('/docs/incoming/other.txt');
});
