import AsyncStorage from '@react-native-async-storage/async-storage';
const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async key => mockDisk.get(key) || null),
    setItem: jest.fn(async (key, value) => {
      mockDisk.set(key, value);
    }),
  },
}));
import { rangeFetch, readGGUFMetadata } from './ggufMetadata';
import { gguf } from '@huggingface/gguf';
import type { HubDetails } from './huggingFace';
jest.mock('@huggingface/gguf', () => ({ gguf: jest.fn() }));
const constructors: FakeXHR[] = [];
class FakeXHR {
  responseType = '';
  timeout = 0;
  readyState = 0;
  status = 206;
  response = new ArrayBuffer(8);
  onreadystatechange = () => {};
  onprogress = (_e: {
    loaded: number;
    lengthComputable: boolean;
    total: number;
  }) => {};
  onerror = () => {};
  ontimeout = () => {};
  onabort = () => {};
  onload = () => {};
  headers: Record<string, string> = {};
  open = jest.fn();
  setRequestHeader = (key: string, value: string) => {
    this.headers[key] = value;
  };
  send = jest.fn();
  abort = jest.fn(() => this.onabort());
  getResponseHeader = () => 'bytes 0-7/1000';
  constructor() {
    constructors.push(this);
  }
}
let original: typeof XMLHttpRequest;
beforeEach(() => {
  constructors.length = 0;
  original = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeXHR as unknown as typeof XMLHttpRequest;
});
afterEach(() => {
  globalThis.XMLHttpRequest = original;
});
test('uses bounded ranged requests with session auth and rejects whole-file responses', async () => {
  const abort = new AbortController();
  const request = rangeFetch(abort.signal, 'hf_read');
  const valid = request('https://huggingface.co/model', {
    headers: { Range: 'bytes=0-1999999' },
  });
  const xhr = constructors[0];
  expect(xhr.headers).toEqual({
    Range: 'bytes=0-1999999',
    Authorization: 'Bearer hf_read',
  });
  xhr.onload();
  expect((await valid).status).toBe(206);
  const rejected = request('https://huggingface.co/model');
  const full = constructors[1];
  full.readyState = 2;
  full.status = 200;
  full.onreadystatechange();
  await expect(rejected).rejects.toThrow('metadata');
  expect(full.abort).toHaveBeenCalled();
});
test('aborts metadata requests when closing the repository', async () => {
  const abort = new AbortController();
  const result = rangeFetch(abort.signal, '')('https://huggingface.co/model');
  abort.abort();
  await expect(result).rejects.toThrow('metadata');
  expect(constructors[0].abort).toHaveBeenCalled();
});
test('does not claim RAM compatibility for missing architecture metadata', async () => {
  (gguf as jest.Mock).mockResolvedValue({
    metadata: { 'general.architecture': 'unknown' },
  });
  const details: HubDetails = {
    model: {
      id: 'org/unknown',
      author: 'org',
      name: 'unknown',
      downloads: 0,
      likes: 0,
      gated: false,
      vision: false,
    },
    revision: 'a'.repeat(40),
    license: 'mit',
    files: [],
  };
  await expect(
    readGGUFMetadata(
      details,
      {
        path: 'file.gguf',
        size: 1000,
        quantization: 'Q4_K_M',
        projector: false,
        split: false,
      },
      '',
      new AbortController().signal,
    ),
  ).resolves.toBeNull();
});

test('restores revision-pinned metadata after restart and fetches changed revisions', async () => {
  const architecture = {
    'general.architecture': 'qwen2',
    'qwen2.block_count': 24,
    'qwen2.attention.head_count_kv': 2,
    'qwen2.attention.key_length': 64,
    'qwen2.attention.value_length': 64,
    'qwen2.context_length': 8192,
  };
  const details = {
    model: { id: 'org/cached' },
    revision: 'b'.repeat(40),
  } as HubDetails;
  const file = {
    path: 'cached.gguf',
    size: 1000,
    quantization: 'Q4_K_M',
    projector: false,
    split: false,
  };
  (gguf as jest.Mock).mockResolvedValue({ metadata: architecture });
  const value = await readGGUFMetadata(
    details,
    file,
    'hf_private',
    new AbortController().signal,
  );
  await Promise.resolve();
  expect(AsyncStorage.setItem).toHaveBeenCalled();
  expect([...mockDisk.values()].join('')).not.toContain('hf_private');
  let restoredReader = readGGUFMetadata;
  let restartedParser: jest.Mock = jest.fn();
  jest.isolateModules(() => {
    restoredReader = require('./ggufMetadata').readGGUFMetadata;
    restartedParser = require('@huggingface/gguf').gguf;
  });
  restartedParser.mockClear();
  await expect(
    restoredReader(details, file, '', new AbortController().signal),
  ).resolves.toEqual(value);
  expect(restartedParser).not.toHaveBeenCalled();
  restartedParser.mockResolvedValue({ metadata: architecture });
  await restoredReader(
    { ...details, revision: 'c'.repeat(40) },
    file,
    '',
    new AbortController().signal,
  );
  expect(restartedParser).toHaveBeenCalledTimes(1);
});

test('bounds the complete remote metadata check to twelve seconds', async () => {
  jest.useFakeTimers();
  try {
    (gguf as jest.Mock).mockImplementation((url, options) =>
      options.fetch(url),
    );
    const work = readGGUFMetadata(
      { model: { id: 'org/timeout' }, revision: 'd'.repeat(40) } as HubDetails,
      {
        path: 'slow.gguf',
        size: 1000,
        quantization: 'Q4',
        projector: false,
        split: false,
      },
      '',
      new AbortController().signal,
    );
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(12000);
    await expect(work).resolves.toBeNull();
    expect(constructors[0].abort).toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
