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
