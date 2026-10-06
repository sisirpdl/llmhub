import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const mockListeners: Record<string, (event: any) => Promise<void> | void> = {};
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    AppState: actual.AppState,
    Share: actual.Share,
    NativeModules: {
      ...actual.NativeModules,
      LanHttp: {
        start: jest.fn(),
        stop: jest.fn(),
        respond: jest.fn(),
        request: jest.fn(),
        cancel: jest.fn(),
      },
    },
    NativeEventEmitter: class {
      addListener(name: string, callback: any) {
        mockListeners[name] = callback;
        return {
          remove: () => {
            delete mockListeners[name];
          },
        };
      }
    },
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));
import { AppState, NativeModules } from 'react-native';
const mockNative = NativeModules.LanHttp as {
  start: jest.Mock;
  stop: jest.Mock;
  respond: jest.Mock;
  request: jest.Mock;
  cancel: jest.Mock;
};
import type { LlamaContext } from 'llama.rn';
import { SUPPORTED_MODELS as CATALOG } from '../models/modelCatalog';
import { defaultsFor } from '../settings/modelSettings';
import { useLan } from './useLan';
let lan: ReturnType<typeof useLan>;
let renderer: Renderer.ReactTestRenderer;
let lifecycle: (value: string) => void;
const context = { completion: jest.fn(), stopCompletion: jest.fn() };
const notice = jest.fn();
let localContext: LlamaContext | null;
function Harness() {
  lan = useLan({
    context: localContext,
    model: CATALOG[0],
    settings: defaultsFor(CATALOG[0]),
    contextLength: 2048,
    generationActive: false,
    setNotice: notice,
  });
  return null;
}
beforeEach(async () => {
  jest.clearAllMocks();
  localContext = context as unknown as LlamaContext;
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    fn: any,
  ) => {
    if (_event === 'change') lifecycle = fn;
    return { remove: jest.fn() };
  }) as any);
  mockNative.start.mockResolvedValue({
    url: 'http://192.168.1.2:8080',
    token: 'a'.repeat(48),
    session: 'session1',
  });
  mockNative.stop.mockResolvedValue(undefined);
  mockNative.respond.mockResolvedValue(undefined);
  context.stopCompletion.mockReturnValue(undefined);
  context.completion.mockResolvedValue({ text: 'Hello' });
  mockNative.request.mockResolvedValue({
    status: 200,
    body: JSON.stringify({
      data: [
        { id: 'remote-qwen', llmhub_name: 'Remote Qwen', context_length: 2048 },
      ],
    }),
  });
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
});
afterEach(async () => {
  await act(async () => {
    renderer.unmount();
  });
  jest.restoreAllMocks();
});
const incoming = (
  id = 'one',
  body = JSON.stringify({
    model: CATALOG[0].id,
    messages: [{ role: 'user', content: 'Hi' }],
  }),
) =>
  mockListeners.LanRequest({
    id,
    session: 'session1',
    method: 'POST',
    path: '/v1/chat/completions',
    body,
  });
test('hosts a loaded model and returns native completion as OpenAI JSON', async () => {
  await act(async () => {
    await lan.start();
  });
  expect(lan.host?.token).toHaveLength(48);
  await act(async () => {
    await incoming();
  });
  expect(context.completion).toHaveBeenCalledWith(
    expect.objectContaining({ messages: [{ role: 'user', content: 'Hi' }] }),
  );
  const [id, status, body] = mockNative.respond.mock.calls[0];
  expect(id).toBe('one');
  expect(status).toBe(200);
  expect(JSON.parse(body).choices[0].message.content).toBe('Hello');
});
test('rejects parallel inference and invalid messages without invoking the model', async () => {
  let finish!: (value: any) => void;
  context.completion.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    await lan.start();
  });
  let first: any;
  await act(async () => {
    first = incoming('one');
  });
  await act(async () => {
    await incoming('two');
  });
  expect(mockNative.respond).toHaveBeenCalledWith(
    'two',
    409,
    expect.any(String),
  );
  await act(async () => {
    finish({ text: 'Done' });
    await first;
  });
  await act(async () => {
    await incoming('bad', '{');
  });
  expect(mockNative.respond).toHaveBeenCalledWith(
    'bad',
    400,
    expect.any(String),
  );
  expect(context.completion).toHaveBeenCalledTimes(1);
});
test('connects with no local model and sends the same messages shape', async () => {
  localContext = null;
  await act(async () => {
    renderer.update(<Harness />);
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  expect(lan.remote?.model.id).toBe('remote-qwen');
  mockNative.request.mockResolvedValueOnce({
    status: 200,
    body: JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'From host' } }],
    }),
  });
  const messages = [
    { role: 'user' as const, content: 'Ask from docs\nReference passage.' },
  ];
  let result;
  await act(async () => {
    result = await lan.remote!.context.completion({ messages, n_predict: 100 });
  });
  expect(result).toMatchObject({ text: 'From host' });
  const wire = JSON.parse(mockNative.request.mock.calls[1][4]);
  expect(wire.messages).toEqual(messages);
  expect(wire.model).toBe('remote-qwen');
  expect(wire.stream).toBe(false);
});
test('backgrounding invalidates a pending host start', async () => {
  let resolve!: (host: any) => void;
  mockNative.start.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  let work!: Promise<boolean>;
  await act(async () => {
    work = lan.start();
  });
  await act(async () => {
    lifecycle('background');
  });
  await act(async () => {
    resolve({
      url: 'http://192.168.1.2:8080',
      token: 'a'.repeat(48),
      session: 'session1',
    });
    await work;
  });
  expect(lan.host).toBeNull();
  expect(mockNative.stop).toHaveBeenCalled();
});
test('stops native hosting after a model is offloaded', async () => {
  await act(async () => {
    await lan.start();
  });
  localContext = null;
  await act(async () => {
    renderer.update(<Harness />);
  });
  expect(lan.host).toBeNull();
  expect(context.stopCompletion).toHaveBeenCalled();
});
test('cancels a remote request when stopping generation', async () => {
  await act(async () => {
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  let reject!: (error: Error) => void;
  mockNative.request.mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  mockNative.cancel.mockImplementationOnce(() =>
    reject(new Error('Cancelled')),
  );
  const engine = lan.remote!.context;
  const work = engine
    .completion({ messages: [{ role: 'user', content: 'Hi' }] })
    .catch(e => e.message);
  await act(async () => {
    await engine.stopCompletion();
  });
  expect(await work).toBe('Cancelled');
  expect(lan.remoteStatus).toBe('ready');
  expect(lan.error).toBe('');
  expect(mockNative.cancel).toHaveBeenCalled();
});
test('lists the hosted model and cancels only the matching active request', async () => {
  let finish!: (value: any) => void;
  context.completion.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    await lan.start();
    await mockListeners.LanRequest({
      id: 'models',
      session: 'session1',
      method: 'GET',
      path: '/v1/models',
      body: '',
    });
  });
  expect(JSON.parse(mockNative.respond.mock.calls[0][2]).data[0]).toMatchObject(
    { id: CATALOG[0].id, context_length: 2048 },
  );
  let work: any;
  await act(async () => {
    work = incoming('generation');
  });
  await act(async () => {
    await mockListeners.LanCancelled({ id: 'other' });
  });
  expect(context.stopCompletion).not.toHaveBeenCalled();
  await act(async () => {
    await mockListeners.LanCancelled({ id: 'generation' });
  });
  expect(context.stopCompletion).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ text: 'partial' });
    await work;
  });
});
test('an invalidated connection cannot become active after its response arrives', async () => {
  let resolve!: (value: any) => void;
  mockNative.request.mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  let work!: Promise<boolean>;
  await act(async () => {
    work = lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  await act(async () => {
    await lan.stop();
  });
  await act(async () => {
    resolve({
      status: 200,
      body: JSON.stringify({ data: [{ id: 'remote', context_length: 2048 }] }),
    });
    await work;
  });
  expect(lan.remote).toBeNull();
  expect(mockNative.cancel).toHaveBeenCalled();
});
test('generation deadline stops completion and marks the reply as truncated', async () => {
  jest.useFakeTimers();
  let finish!: (value: any) => void;
  context.completion.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  await act(async () => {
    await lan.start();
  });
  let work: any;
  await act(async () => {
    work = incoming('slow');
  });
  await act(async () => {
    jest.advanceTimersByTime(150000);
  });
  expect(context.stopCompletion).toHaveBeenCalled();
  await act(async () => {
    finish({ text: 'partial' });
    await work;
  });
  expect(
    JSON.parse(mockNative.respond.mock.calls[0][2]).choices[0].finish_reason,
  ).toBe('length');
  jest.useRealTimers();
});
test('rejects requests queued from a previous native host session', async () => {
  await act(async () => {
    await lan.start();
  });
  await act(async () => {
    await mockListeners.LanRequest({
      id: 'old',
      session: 'previous-session',
      method: 'POST',
      path: '/v1/chat/completions',
      body: JSON.stringify({
        model: CATALOG[0].id,
        messages: [{ role: 'user', content: 'Old key request' }],
      }),
    });
  });
  expect(mockNative.respond).toHaveBeenCalledWith(
    'old',
    503,
    expect.any(String),
  );
  expect(context.completion).not.toHaveBeenCalled();
});
test('an old client adapter cannot send after disconnecting', async () => {
  await act(async () => {
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  const engine = lan.remote!.context;
  await act(async () => {
    await lan.stop();
  });
  await expect(
    engine.completion({ messages: [{ role: 'user', content: 'stale' }] }),
  ).rejects.toThrow(/connection has ended/);
  expect(mockNative.request).toHaveBeenCalledTimes(1);
});
test('stopping an old adapter does not cancel a new connection check', async () => {
  await act(async () => {
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  const old = lan.remote!.context;
  await act(async () => {
    await lan.stop();
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  let finish!: (value: any) => void;
  mockNative.request.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  let probe!: Promise<boolean>;
  await act(async () => {
    probe = lan.checkConnection();
  });
  await act(async () => {
    await old.stopCompletion();
  });
  expect(mockNative.cancel).not.toHaveBeenCalled();
  await act(async () => {
    finish({
      status: 200,
      body: JSON.stringify({
        data: [{ id: 'remote-qwen', context_length: 2048 }],
      }),
    });
    await probe;
  });
  expect(lan.remoteStatus).toBe('ready');
});
test('connection cancellation reports failure rather than a successful pairing', async () => {
  let finish!: (value: any) => void;
  mockNative.request.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      }),
  );
  let connect!: Promise<boolean>;
  await act(async () => {
    connect = lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  expect(lan.activity).toBe('connecting');
  await act(async () => {
    await lan.stop();
  });
  await act(async () => {
    finish({
      status: 200,
      body: JSON.stringify({
        data: [{ id: 'remote-qwen', context_length: 2048 }],
      }),
    });
  });
  expect(await connect).toBe(false);
  expect(lan.remote).toBeNull();
  expect(lan.error).toBe('');
});
test('a late native stopped event cannot stop a new host session', async () => {
  await act(async () => {
    await lan.start();
    await mockListeners.LanStopped({ session: 'old-session' });
  });
  expect(lan.host?.session).toBe('session1');
  await act(async () => {
    await mockListeners.LanStopped({ session: 'session1' });
  });
  expect(lan.host).toBeNull();
});
test('transport failures can be checked and recovered without silently changing inference mode', async () => {
  await act(async () => {
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  mockNative.request.mockRejectedValueOnce(new Error('Wi-Fi lost'));
  await act(async () => {
    await lan
      .remote!.context.completion({
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .catch(() => {});
  });
  expect(lan.remoteStatus).toBe('unreachable');
  expect(lan.remote).not.toBeNull();
  expect(lan.error).toBe('Wi-Fi lost');
  await act(async () => {
    expect(await lan.checkConnection()).toBe(true);
  });
  expect(lan.remoteStatus).toBe('ready');
  expect(lan.error).toBe('');
});
test('busy host replies do not mark the connection unreachable', async () => {
  await act(async () => {
    await lan.connect('http://192.168.1.2:8080', 'a'.repeat(48));
  });
  mockNative.request.mockResolvedValueOnce({
    status: 409,
    body: JSON.stringify({ error: { message: 'Host busy' } }),
  });
  await act(async () => {
    await lan
      .remote!.context.completion({
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .catch(() => {});
  });
  expect(lan.remoteStatus).toBe('ready');
  expect(lan.error).toBe('');
});
test('validation errors stay in LAN settings and do not use the global banner', async () => {
  await act(async () => {
    expect(await lan.connect('http://8.8.8.8:8080', 'a'.repeat(48))).toBe(
      false,
    );
  });
  expect(lan.error).toMatch(/private/);
  expect(notice).not.toHaveBeenCalled();
  expect(mockNative.request).not.toHaveBeenCalled();
});
