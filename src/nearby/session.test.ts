/// <reference types="node" />
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { NearbySession } from './session';
import type { TransferFiles, TransferHttp, Incoming } from './native';
import { CHUNK_BYTES, controlAAD, chunkAAD } from './protocol';
import * as storage from './storage';
jest.mock('./storage', () => ({
  makeOffer: jest.fn(),
  loadCheckpoint: jest.fn(),
  fingerprintCompatible: jest.fn(),
  offsets: jest.fn(),
  prepare: jest.fn(),
  partialPath: jest.fn(() => '/docs/incoming/model.part'),
  finish: jest.fn(),
  discardPartial: jest.fn(),
}));
const secret = '1'.repeat(48);
const offer = {
  version: 1 as const,
  id: 'a'.repeat(48),
  name: 'Test model',
  license: 'Apache-2.0',
  contextLength: 2048,
  artifacts: [
    { name: 'model.gguf', size: CHUNK_BYTES + 8, sha256: 'b'.repeat(64) },
  ],
};
const key = (s: string) =>
  createHash('sha256').update(`llmhub-transfer-enc-v1:${s}`).digest();
function seal(bytes: Buffer, s: string, aad: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(s), nonce);
  cipher.setAAD(Buffer.from(aad));
  return Buffer.concat([
    nonce,
    cipher.update(bytes),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}
function open(text: string, s: string, aad: string) {
  const bytes = Buffer.from(text, 'base64'),
    cipher = createDecipheriv('aes-256-gcm', key(s), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(aad));
  cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    cipher.update(bytes.subarray(12, -16)),
    cipher.final(),
  ]);
}
function cryptoFiles(): TransferFiles {
  return {
    pairing: jest.fn(async () => ({ secret, authorization: '2'.repeat(48) })),
    auth: jest.fn(async () => '2'.repeat(48)),
    sealText: jest.fn(async (text, s, aad) => seal(Buffer.from(text), s, aad)),
    openText: jest.fn(async (text, s, aad) => open(text, s, aad).toString()),
    readChunk: jest.fn(async (_path, _offset, length, s, aad) =>
      seal(Buffer.alloc(length, 9), s, aad),
    ),
    writeChunk: jest.fn(
      async (_path, _offset, text, s, aad) => open(text, s, aad).length,
    ),
    advertise: jest.fn(async () => {}),
    discover: jest.fn(async () => {}),
    stopNearby: jest.fn(async () => {}),
  };
}
let sender: NearbySession,
  receiver: NearbySession,
  senderFiles: TransferFiles,
  receiverFiles: TransferFiles;
let receiverHttp: TransferHttp;
let register: jest.Mock;
let responses: Map<
  string,
  {
    resolve: (value: { status: number; body: string }) => void;
    reject: (error: Error) => void;
  }
>;
let mutate: ((body: string) => string) | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mutate = undefined;
  responses = new Map();
  (storage.makeOffer as jest.Mock).mockResolvedValue({
    offer,
    paths: ['/docs/models/model.gguf'],
  });
  (storage.loadCheckpoint as jest.Mock).mockResolvedValue(null);
  (storage.prepare as jest.Mock).mockResolvedValue({
    version: 1,
    id: 'import-1-abc',
    offer,
  });
  (storage.offsets as jest.Mock).mockResolvedValue([0]);
  (storage.finish as jest.Mock).mockImplementation(
    async (_checkpoint, callback, valid) => {
      if (valid()) await callback({ id: 'import-1-abc' });
    },
  );
  const senderHttp: TransferHttp = {
    startWithAuthorization: jest.fn(async () => ({
      url: 'http://192.168.1.10:8081',
      token: '2'.repeat(48),
      session: 'host-session',
    })),
    stop: jest.fn(async () => {}),
    cancel: jest.fn(),
    request: jest.fn(),
    respond: jest.fn(async (id, status, body) => {
      const response = responses.get(id);
      responses.delete(id);
      response?.resolve({ status, body: mutate ? mutate(body) : body });
    }),
  };
  receiverHttp = {
    ...senderHttp,
    stop: jest.fn(async () => {}),
    request: jest.fn(
      (id, _url, _token, _method, body) =>
        new Promise((resolve, reject) => {
          responses.set(id, { resolve, reject });
          sender.handle({
            session: 'host-session',
            id,
            method: 'POST',
            path: '/transfer',
            body,
          });
        }),
    ),
    cancel: jest.fn(id => {
      responses.get(id)?.reject(new Error('Cancelled'));
      responses.delete(id);
    }),
  };
  senderFiles = cryptoFiles();
  receiverFiles = cryptoFiles();
  register = jest.fn(async () => {});
  sender = new NearbySession(senderFiles, senderHttp, () => {}, jest.fn());
  receiver = new NearbySession(receiverFiles, receiverHttp, () => {}, register);
});
async function pair() {
  await sender.share({} as any);
  await receiver.connect('http://192.168.1.10:8081', secret);
  expect(receiver.state.stage).toBe('preview');
}
test('two sessions transfer exact bounded chunks and import only after verification', async () => {
  await pair();
  expect(register).not.toHaveBeenCalled();
  await receiver.receive();
  expect(senderFiles.readChunk).toHaveBeenCalledTimes(2);
  expect(receiverFiles.writeChunk).toHaveBeenCalledTimes(2);
  expect(receiverFiles.writeChunk).toHaveBeenLastCalledWith(
    '/docs/incoming/model.part',
    CHUNK_BYTES,
    expect.any(String),
    secret,
    expect.stringContaining(`:0:${CHUNK_BYTES}:8:`),
  );
  expect(register).toHaveBeenCalledTimes(1);
  expect(receiver.state.stage).toBe('done');
  expect(sender.state.stage).toBe('done');
  for (const call of (receiverHttp.request as jest.Mock).mock.calls) {
    expect(call[2]).not.toBe(secret);
    expect(call[4]).not.toContain('"action"');
  }
});
test('resumes at the existing complete chunk, including tail-only transfers', async () => {
  await pair();
  (storage.offsets as jest.Mock).mockResolvedValue([CHUNK_BYTES]);
  await receiver.receive();
  expect(senderFiles.readChunk).toHaveBeenCalledTimes(1);
  expect(senderFiles.readChunk).toHaveBeenCalledWith(
    expect.any(String),
    CHUNK_BYTES,
    8,
    secret,
    expect.any(String),
  );
  expect(register).toHaveBeenCalledTimes(1);
});
test('tampered ciphertext never writes or registers a model', async () => {
  await pair();
  mutate = body => {
    const data = JSON.parse(body);
    if (data.chunk) {
      const bytes = Buffer.from(data.chunk, 'base64');
      bytes[20] = (bytes[20] + 1) % 256;
      data.chunk = bytes.toString('base64');
    }
    return JSON.stringify(data);
  };
  await receiver.receive();
  expect(receiver.state.stage).toBe('error');
  expect(storage.finish).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
});
test('final verification failure never registers a model', async () => {
  await pair();
  (storage.finish as jest.Mock).mockRejectedValue(new Error('Checksum failed'));
  await receiver.receive();
  expect(receiver.state.error).toContain('Checksum');
  expect(register).not.toHaveBeenCalled();
});
test('pause cancels an outstanding request and prevents a late chunk write', async () => {
  await pair();
  let arrived: () => void;
  const waiting = new Promise<void>(resolve => {
    arrived = resolve;
  });
  (senderFiles.readChunk as jest.Mock).mockImplementationOnce(async () => {
    arrived();
    return new Promise(() => {});
  });
  const receiving = receiver.receive();
  await waiting;
  await receiver.stop();
  await receiving;
  expect(receiverHttp.cancel).toHaveBeenCalled();
  expect(receiverFiles.writeChunk).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();
  expect(receiver.state.stage).toBe('paused');
});
test('pause during preparing never starts a late server', async () => {
  let release: (value: any) => void;
  (storage.makeOffer as jest.Mock).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        release = resolve;
      }),
  );
  const sharing = sender.share({} as any);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  const stopping = sender.stop();
  release!({ offer, paths: [] });
  await Promise.all([sharing, stopping]);
  expect(senderFiles.advertise).not.toHaveBeenCalled();
  expect(sender.state.secret).toBeUndefined();
});
test('sender rejects an unapproved receiver and invalid offsets', async () => {
  await pair();
  async function request(message: any, id: string) {
    const body = JSON.stringify({
      id,
      cipher: seal(
        Buffer.from(JSON.stringify(message)),
        secret,
        controlAAD('request', id),
      ),
    });
    const result = new Promise<{ status: number; body: string }>(
      (resolve, reject) => responses.set(id, { resolve, reject }),
    );
    await sender.handle({
      id,
      session: 'host-session',
      method: 'POST',
      path: '/transfer',
      body,
    } as Incoming);
    const response = await result;
    return JSON.parse(
      open(
        JSON.parse(response.body).cipher,
        secret,
        controlAAD('response', id),
      ).toString(),
    );
  }
  const owner = 'c'.repeat(48);
  expect(
    (
      await request(
        {
          action: 'chunk',
          receiver: owner,
          offer: offer.id,
          artifact: 0,
          offset: 0,
          length: CHUNK_BYTES,
        },
        owner + '-1',
      )
    ).error,
  ).toContain('Accept');
  await request(
    { action: 'accept', receiver: owner, offer: offer.id },
    owner + '-2',
  );
  expect(
    (
      await request(
        { action: 'accept', receiver: 'd'.repeat(48), offer: offer.id },
        owner + '-3',
      )
    ).error,
  ).toContain('another receiver');
  expect(
    (
      await request(
        {
          action: 'chunk',
          receiver: owner,
          offer: offer.id,
          artifact: 0,
          offset: 1,
          length: 8,
        },
        owner + '-4',
      )
    ).error,
  ).toContain('range');
  expect(senderFiles.readChunk).not.toHaveBeenCalled();
});
test('AES combined layout and AAD reject wrong keys, offsets, or directions', () => {
  const aad = chunkAAD(offer.id, 0, 0, 8, 'req'),
    cipher = seal(Buffer.from('GGUFtest'), secret, aad);
  expect(open(cipher, secret, aad).toString()).toBe('GGUFtest');
  expect(() => open(cipher, '3'.repeat(48), aad)).toThrow();
  expect(() =>
    open(cipher, secret, chunkAAD(offer.id, 0, 8, 8, 'req')),
  ).toThrow();
});
