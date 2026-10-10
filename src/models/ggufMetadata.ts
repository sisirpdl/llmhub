import AsyncStorage from '@react-native-async-storage/async-storage';
import { hfAuthHeaders } from './hfAuth';
import 'fast-text-encoding';
import { gguf } from '@huggingface/gguf';
import { hubDownloadUrl, type HubDetails, type HubFile } from './huggingFace';
import { memoryMetadata, type MemoryMetadata } from './deviceSuitability';
const cache = new Map<string, MemoryMetadata>();
const CACHE_KEY = '@llmhub/gguf-memory-metadata-v1';
let restored: Promise<void> | undefined;
let writes = Promise.resolve();
function restoreCache() {
  if (!restored)
    restored = AsyncStorage.getItem(CACHE_KEY)
      .then(raw => {
        const entries: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(entries)) return;
        for (const entry of entries.slice(-80)) {
          if (
            !Array.isArray(entry) ||
            typeof entry[0] !== 'string' ||
            !entry[1] ||
            typeof entry[1] !== 'object'
          )
            continue;
          const [url, value] = entry as [string, MemoryMetadata];
          // Revalidate persisted values using the current estimator's supported architectures.
          const a = value.architecture;
          const valid = memoryMetadata({
            'general.architecture': a,
            [`${a}.block_count`]: value.layers,
            [`${a}.attention.head_count_kv`]: value.kvHeads,
            [`${a}.attention.key_length`]: value.keyLength,
            [`${a}.attention.value_length`]: value.valueLength,
            [`${a}.context_length`]: value.maxContext,
          });
          if (
            valid &&
            /^https:\/\/huggingface\.co\/.+\/resolve\/[a-f0-9]{40}\//i.test(url)
          )
            cache.set(url, valid);
        }
      })
      .catch(() => {});
  return restored;
}
function persistCache() {
  const snapshot = JSON.stringify([...cache]);
  // Serialize snapshots so an earlier, slower write cannot replace newer results.
  writes = writes
    .then(() => AsyncStorage.setItem(CACHE_KEY, snapshot))
    .catch(() => {});
  return writes;
}
// Bound range responses before reading them; never fetch full model weights to classify RAM.
export function rangeFetch(signal: AbortSignal, token: string): typeof fetch {
  let requests = 0;
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      if (signal.aborted || ++requests > 4) {
        reject(new Error('Metadata request cancelled or too large.'));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open('GET', String(input));
      xhr.responseType = 'arraybuffer';
      xhr.timeout = 12000;
      const headers = init?.headers as Record<string, string> | undefined;
      Object.entries(headers || {}).forEach(([key, value]) =>
        xhr.setRequestHeader(key, value),
      );
      const auth = hfAuthHeaders(String(input), token);
      if (auth) xhr.setRequestHeader('Authorization', auth.Authorization);
      const cancel = () => xhr.abort();
      const cleanup = () => signal.removeEventListener('abort', cancel);
      signal.addEventListener('abort', cancel);
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 2 && xhr.status !== 206) xhr.abort();
      };
      xhr.onprogress = event => {
        if (
          event.loaded > 2_000_000 ||
          (event.lengthComputable && event.total > 2_000_000)
        )
          xhr.abort();
      };
      xhr.onerror =
        xhr.ontimeout =
        xhr.onabort =
          () => {
            cleanup();
            reject(new Error('Unable to inspect GGUF metadata.'));
          };
      xhr.onload = () => {
        cleanup();
        if (
          xhr.status !== 206 ||
          !(xhr.response instanceof ArrayBuffer) ||
          xhr.response.byteLength > 2_000_000
        ) {
          reject(new Error('Metadata range unavailable.'));
          return;
        }
        resolve({
          ok: true,
          status: 206,
          headers: { get: (key: string) => xhr.getResponseHeader(key) },
          arrayBuffer: async () => xhr.response,
        } as Response);
      };
      xhr.send();
    });
}
export async function readGGUFMetadata(
  details: HubDetails,
  file: HubFile,
  token: string,
  signal: AbortSignal,
): Promise<MemoryMetadata | null> {
  const url = hubDownloadUrl(details.model.id, details.revision, file.path);
  await restoreCache();
  if (signal.aborted) return null;
  const found = cache.get(url);
  if (found) return found;
  const budget = new AbortController();
  const cancel = () => budget.abort();
  signal.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, 12000);
  try {
    const parsed = await gguf(url, { fetch: rangeFetch(budget.signal, token) });
    const result = memoryMetadata(parsed.metadata as Record<string, unknown>);
    if (result && !signal.aborted && !budget.signal.aborted) {
      if (cache.size >= 80) cache.delete(cache.keys().next().value!);
      cache.set(url, result);
      persistCache();
    }
    return signal.aborted || budget.signal.aborted ? null : result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}
