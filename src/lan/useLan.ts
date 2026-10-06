import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  NativeEventEmitter,
  NativeModules,
  Share,
} from 'react-native';
import type { LlamaContext } from 'llama.rn';
import type { ModelManifest } from '../models/modelCatalog';
import type { ModelSettings } from '../settings/modelSettings';
import {
  accessKey,
  completionParameters,
  lanAddress,
  modelFromResponse,
  type ChatEngine,
} from './protocol';
type Host = { url: string; token: string; session: string };
type Remote = {
  url: string;
  model: ModelManifest;
  contextLength: number;
  context: ChatEngine;
};
type Request = {
  session: string;
  id: string;
  method: string;
  path: string;
  body: string;
};
type Activity = 'starting' | 'connecting' | 'checking' | null;
class HostError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
type Transport = {
  start(port: number): Promise<Host>;
  stop(): Promise<void>;
  respond(id: string, status: number, body: string): Promise<void>;
  request(
    id: string,
    url: string,
    token: string,
    method: string,
    body: string,
  ): Promise<{ status: number; body: string }>;
  cancel(id: string): void;
};
const native: Transport | undefined = NativeModules.LanHttp;
export function useLan(options: {
  context: LlamaContext | null;
  model: ModelManifest;
  settings: ModelSettings;
  contextLength: number | null;
  generationActive: boolean;
  setNotice: (text: string) => void;
}) {
  const [host, setHost] = useState<Host | null>(null);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [activity, setActivity] = useState<Activity>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<
    'ready' | 'generating' | 'unreachable'
  >('ready');
  const pending = activity !== null || stopping;
  const [serving, setServing] = useState(false);
  const snapshot = useRef(options);
  snapshot.current = options;
  const hosting = useRef<{
    context: LlamaContext;
    model: ModelManifest;
    settings: ModelSettings;
    contextLength: number;
    session: number;
    nativeSession?: string;
  } | null>(null);
  const busy = useRef(false);
  const activeIncoming = useRef<string | null>(null);
  const operation = useRef(0);
  const pendingRef = useRef(false);
  const requests = useRef(new Set<string>());
  const counter = useRef(0);
  const sharing = useRef(false);
  const shutdown = useRef<Promise<void> | null>(null);
  const connection = useRef<{
    session: number;
    url: string;
    token: string;
    modelId: string;
    contextLength: number;
  } | null>(null);
  async function request(
    url: string,
    token: string,
    method: string,
    body = '',
    owned?: Set<string>,
  ) {
    if (!native) throw new Error('Rebuild the app to enable LAN networking.');
    const id = `lan-${Date.now()}-${++counter.current}`;
    requests.current.add(id);
    owned?.add(id);
    try {
      const response = await native.request(id, url, token, method, body);
      let parsed;
      try {
        parsed = JSON.parse(response.body);
      } catch {
        throw new Error('The host returned an invalid response.');
      }
      if (response.status !== 200)
        throw new HostError(
          [401, 403].includes(response.status)
            ? 'The access key is invalid or expired. Disconnect and enter the host’s current key.'
            : typeof parsed?.error?.message === 'string'
            ? parsed.error.message.slice(0, 300)
            : `Host returned HTTP ${response.status}.`,
          response.status,
        );
      return parsed;
    } finally {
      requests.current.delete(id);
      owned?.delete(id);
    }
  }
  async function stop() {
    ++operation.current;
    const previous = hosting.current;
    hosting.current = null;
    connection.current = null;
    setHost(null);
    setRemote(null);
    setError('');
    requests.current.forEach(id => native?.cancel(id));
    requests.current.clear();
    if (shutdown.current) return shutdown.current;
    setStopping(true);
    const work = (async () => {
      try {
        await native?.stop();
      } catch {}
      if (previous) {
        try {
          await previous.context.stopCompletion();
        } catch {}
      }
    })();
    shutdown.current = work;
    try {
      await work;
    } finally {
      if (shutdown.current === work) shutdown.current = null;
      setStopping(false);
    }
  }
  useEffect(() => {
    if (!native) return;
    const emitter = new NativeEventEmitter(NativeModules.LanHttp);
    const incoming = emitter.addListener(
      'LanRequest',
      async (event: Request) => {
        const current = hosting.current;
        const respond = (status: number, value: unknown) =>
          native
            .respond(event.id, status, JSON.stringify(value))
            .catch(() => {});
        const respondError = (status: number, message: string) =>
          respond(status, {
            error: { message, type: 'invalid_request_error' },
          });
        if (
          !current ||
          !current.nativeSession ||
          current.nativeSession !== event.session ||
          snapshot.current.context !== current.context ||
          AppState.currentState !== 'active'
        ) {
          await respondError(503, 'The host model is unavailable.');
          return;
        }
        if (event.path === '/v1/models' && event.method === 'GET') {
          await respond(200, {
            object: 'list',
            data: [
              {
                id: current.model.id,
                object: 'model',
                owned_by: 'llmhub',
                llmhub_name: current.model.displayName,
                context_length: current.contextLength,
              },
            ],
          });
          return;
        }
        if (event.path !== '/v1/chat/completions') {
          await respondError(404, 'Endpoint not found.');
          return;
        }
        if (event.method !== 'POST') {
          await respondError(405, 'Use POST for chat completions.');
          return;
        }
        if (busy.current) {
          await respondError(
            409,
            'The host is generating another response. Try again shortly.',
          );
          return;
        }
        let params;
        try {
          params = completionParameters(
            event.body,
            current.model.id,
            current.settings,
            current.contextLength,
          );
        } catch (e) {
          await respondError(
            400,
            e instanceof Error ? e.message : 'Invalid request.',
          );
          return;
        }
        busy.current = true;
        activeIncoming.current = event.id;
        setServing(true);
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          (async () => {
            try {
              await current.context.stopCompletion();
            } catch {}
          })();
        }, 150000);
        try {
          const result = await current.context.completion(params);
          if (hosting.current !== current) return;
          await respond(200, {
            id: `chatcmpl-${event.id}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: current.model.id,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: result.content || result.text || '',
                },
                finish_reason:
                  timedOut || result.stopped_limit ? 'length' : 'stop',
              },
            ],
          });
        } catch {
          await respondError(500, 'The host could not generate a response.');
        } finally {
          clearTimeout(timeout);
          busy.current = false;
          activeIncoming.current = null;
          setServing(false);
        }
      },
    );
    const cancelled = emitter.addListener(
      'LanCancelled',
      async (event: { id: string }) => {
        if (activeIncoming.current === event.id && hosting.current) {
          try {
            await hosting.current.context.stopCompletion();
          } catch {}
        }
      },
    );
    const stopped = emitter.addListener(
      'LanStopped',
      (event: { session: string }) => {
        if (!hosting.current || hosting.current.nativeSession !== event.session)
          return;
        stop();
        snapshot.current.setNotice(
          'LAN hosting stopped. Check Wi-Fi and start hosting again.',
        );
      },
    );
    const memory = AppState.addEventListener('memoryWarning', () => {
      stop();
    });
    const state = AppState.addEventListener('change', value => {
      if (value === 'background' || (value === 'inactive' && !sharing.current))
        stop();
    });
    return () => {
      incoming.remove();
      cancelled.remove();
      stopped.remove();
      state.remove();
      memory.remove();
      stop();
    };
    // Lifecycle owns native listeners; request handlers read current options through refs.
  }, []);
  useEffect(() => {
    if (hosting.current && options.context !== hosting.current.context) stop();
  }, [options.context]);
  function validSession(session: number) {
    return session === operation.current && AppState.currentState === 'active';
  }
  async function begin(
    kind: Activity,
    action: (session: number) => Promise<boolean>,
  ) {
    if (pendingRef.current || shutdown.current) return false;
    if (snapshot.current.generationActive || busy.current) {
      setError('Stop generation before changing LAN mode.');
      return false;
    }
    pendingRef.current = true;
    setActivity(kind);
    setError('');
    const cleanup = stop();
    const session = operation.current;
    try {
      await cleanup;
      if (!validSession(session)) return false;
      return await action(session);
    } catch (e) {
      if (validSession(session))
        setError(e instanceof Error ? e.message : 'LAN operation failed.');
      return false;
    } finally {
      pendingRef.current = false;
      setActivity(null);
    }
  }
  function start() {
    return begin('starting', async session => {
      const current = snapshot.current;
      if (!native) throw new Error('Rebuild the app to enable LAN networking.');
      if (!current.context || !current.contextLength)
        throw new Error('Load a model before starting LAN hosting.');
      hosting.current = {
        context: current.context,
        model: current.model,
        settings: { ...current.settings },
        contextLength: current.contextLength,
        session,
      };
      setHost({ url: '', token: '', session: '' });
      try {
        const value = await native.start(8080);
        if (!validSession(session)) {
          await native.stop();
          return false;
        }
        if (hosting.current) hosting.current.nativeSession = value.session;
        setHost(value);
        return true;
      } catch (e) {
        if (session === operation.current) {
          hosting.current = null;
          setHost(null);
        }
        throw e;
      }
    });
  }
  function connect(address: string, key: string) {
    return begin('connecting', async session => {
      const url = lanAddress(address);
      const token = accessKey(key);
      const info = modelFromResponse(
        await request(`${url}/v1/models`, token, 'GET'),
      );
      if (!validSession(session)) return false;
      const identity = {
        session,
        url,
        token,
        modelId: info.id,
        contextLength: info.contextLength,
      };
      connection.current = identity;
      setRemoteStatus('ready');
      const owned = new Set<string>();
      let activeRequest: Promise<unknown> | null = null;
      let cancelledByUser = false;
      const context: ChatEngine = {
        completion: async params => {
          if (connection.current !== identity || !validSession(session))
            throw new Error(
              'This LAN connection has ended. Connect to the host again.',
            );
          if (activeRequest)
            throw new Error(
              'Wait for the current LAN response or stop it first.',
            );
          cancelledByUser = false;
          setRemoteStatus('generating');
          const work = request(
            `${url}/v1/chat/completions`,
            token,
            'POST',
            JSON.stringify({
              model: info.id,
              messages: params.messages,
              max_tokens: params.n_predict,
              temperature: params.temperature,
              top_p: params.top_p,
              seed: params.seed,
              stream: false,
            }),
            owned,
          );
          activeRequest = work;
          try {
            const result = await work;
            if (connection.current !== identity || !validSession(session))
              throw new Error('This LAN connection has ended.');
            const content = result?.choices?.[0]?.message?.content;
            if (typeof content !== 'string')
              throw new Error('The host returned an invalid chat completion.');
            if (owned.size === 0 && connection.current === identity)
              setError('');
            return { text: content, content } as Awaited<
              ReturnType<ChatEngine['completion']>
            >;
          } catch (e) {
            if (
              !cancelledByUser &&
              connection.current === identity &&
              validSession(session) &&
              (!(e instanceof HostError) || [401, 403, 503].includes(e.status))
            ) {
              setRemoteStatus('unreachable');
              setError(
                e instanceof Error
                  ? e.message
                  : 'The host is unreachable. Check Wi-Fi or reconnect with a new key.',
              );
            }
            throw e;
          } finally {
            activeRequest = null;
            if (connection.current === identity)
              setRemoteStatus(value =>
                value === 'unreachable' ? value : 'ready',
              );
          }
        },
        stopCompletion: async () => {
          cancelledByUser = true;
          owned.forEach(id => native?.cancel(id));
          if (activeRequest) {
            try {
              await activeRequest;
            } catch {}
          }
        },
      };
      setRemote({
        url,
        model: {
          ...snapshot.current.model,
          id: info.id,
          displayName: `LAN · ${info.name}`,
          promptTemplateId: 'native',
        },
        contextLength: info.contextLength,
        context,
      });
      return true;
    });
  }
  async function checkConnection() {
    const identity = connection.current;
    if (
      !identity ||
      pendingRef.current ||
      shutdown.current ||
      snapshot.current.generationActive
    )
      return false;
    pendingRef.current = true;
    setActivity('checking');
    setError('');
    try {
      const info = modelFromResponse(
        await request(`${identity.url}/v1/models`, identity.token, 'GET'),
      );
      if (connection.current !== identity || !validSession(identity.session))
        return false;
      if (
        info.id !== identity.modelId ||
        info.contextLength !== identity.contextLength
      )
        throw new Error('The host model changed. Disconnect and pair again.');
      setRemoteStatus('ready');
      return true;
    } catch (e) {
      if (connection.current === identity && validSession(identity.session)) {
        setRemoteStatus('unreachable');
        setError(e instanceof Error ? e.message : 'The host is unreachable.');
      }
      return false;
    } finally {
      pendingRef.current = false;
      setActivity(null);
    }
  }
  return {
    host,
    remote,
    pending,
    activity,
    stopping,
    error,
    clearError: () => setError(''),
    remoteStatus,
    checkConnection,
    serving,
    start,
    connect,
    stop,
    share: async () => {
      if (!host?.token) return;
      sharing.current = true;
      try {
        await Share.share({
          message: `LLMHub LAN host\n${host.url}\nAccess key: ${host.token}\nKeep this key private. Connect over trusted Wi-Fi.`,
        });
      } finally {
        sharing.current = false;
      }
    },
  };
}
