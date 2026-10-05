import { hfAuthHeaders } from './hfAuth';
import 'fast-text-encoding';
import { gguf } from '@huggingface/gguf';
import { hubDownloadUrl, type HubDetails, type HubFile } from './huggingFace';
import { memoryMetadata, type MemoryMetadata } from './deviceSuitability';
const cache = new Map<string, MemoryMetadata>();
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
  const found = cache.get(url);
  if (found) return found;
  try {
    const parsed = await gguf(url, { fetch: rangeFetch(signal, token) });
    const result = memoryMetadata(parsed.metadata as Record<string, unknown>);
    if (result && !signal.aborted) {
      if (cache.size >= 80) cache.delete(cache.keys().next().value!);
      cache.set(url, result);
    }
    return result;
  } catch {
    return null;
  }
}
