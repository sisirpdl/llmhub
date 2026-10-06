import type { LlamaContext } from 'llama.rn';
import { validateDocument, type ChatDocument } from '../chat/chatDocument';
import { prepareMessages } from '../chat/promptBuilder';
import type { ModelSettings } from '../settings/modelSettings';
export type ChatEngine = Pick<LlamaContext, 'completion' | 'stopCompletion'>;
export function lanAddress(value: string): string {
  const match = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})\/?$/.exec(
    value.trim(),
  );
  if (!match)
    throw new Error(
      'Enter http://192.168.1.10:8080 using the host’s Wi-Fi IPv4 address.',
    );
  const p = match[1].split('.').map(Number);
  const port = Number(match[2]);
  if (
    p.some(n => n > 255) ||
    !(
      p[0] === 10 ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31)
    ) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error(
      'Use a private Wi-Fi IPv4 address and a port from 1024 to 65535.',
    );
  return `http://${p.join('.')}:${port}`;
}
export function accessKey(value: string): string {
  const key = value.trim();
  if (!/^[a-f0-9]{48}$/.test(key))
    throw new Error('Copy the 48-character access key from the host.');
  return key;
}
export function completionParameters(
  body: string,
  model: string,
  settings: ModelSettings,
  contextLength: number,
) {
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object.');
  if (value.model !== model)
    throw new Error('The requested model is not loaded on this host.');
  if (value.stream !== undefined && value.stream !== false)
    throw new Error('Streaming is not supported yet. Set stream to false.');
  if (value.tools || value.tool_choice || value.response_format)
    throw new Error(
      'Tools and structured output are not supported in LAN mode yet.',
    );
  const document = { model, messages: value.messages } as ChatDocument;
  validateDocument(document);
  if (
    !document.messages.length ||
    document.messages.some(
      m =>
        !['system', 'developer', 'user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' ||
        m.tool_calls,
    )
  )
    throw new Error('LAN mode currently supports text messages only.');
  function number(
    name: string,
    fallback: number,
    min: number,
    max: number,
    integer = false,
  ) {
    const v = value[name] ?? fallback;
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < min ||
      v > max ||
      (integer && !Number.isInteger(v))
    )
      throw new Error(`Invalid ${name}.`);
    return v;
  }
  const n_predict = number(
    'max_tokens',
    Math.min(settings.maxTokens, Math.floor(contextLength / 2)),
    1,
    Math.floor(contextLength / 2),
    true,
  );
  const prepared = prepareMessages(
    document.messages,
    contextLength,
    n_predict,
    false,
  );
  if (prepared.oversized)
    throw new Error('The latest message is too large for the host context.');
  return {
    messages: prepared.messages as Parameters<
      ChatEngine['completion']
    >[0]['messages'],
    n_predict,
    temperature: number('temperature', settings.temperature, 0, 2),
    top_p: number('top_p', settings.topP, 0, 1),
    top_k: settings.topK,
    min_p: settings.minP,
    penalty_repeat: settings.repeatPenalty,
    seed: number('seed', settings.seed, -1, 2147483647, true),
  };
}
export function modelFromResponse(value: unknown): {
  id: string;
  name: string;
  contextLength: number;
} {
  const item = (
    value as {
      data?: Array<{
        id?: unknown;
        llmhub_name?: unknown;
        context_length?: unknown;
      }>;
    }
  )?.data?.[0];
  if (
    !item ||
    typeof item.id !== 'string' ||
    !item.id ||
    item.id.length > 256 ||
    typeof item.context_length !== 'number' ||
    !Number.isInteger(item.context_length) ||
    item.context_length < 512 ||
    item.context_length > 131072
  )
    throw new Error('The host did not return a compatible LLMHub model.');
  return {
    id: item.id,
    name:
      typeof item.llmhub_name === 'string'
        ? item.llmhub_name.slice(0, 256)
        : item.id,
    contextLength: item.context_length,
  };
}
/** Parse only the two connection fields; never persist or retain the pasted text. */
export function pairingDetails(value: string): {
  address: string;
  key: string;
} {
  const address = value.match(/(?:^|\n)\s*(http:\/\/[^\s]+)\s*(?:\n|$)/)?.[1];
  const key = value.match(
    /(?:^|\n)\s*Access key:\s*([a-f0-9]{48})\s*(?:\n|$)/,
  )?.[1];
  if (!address || !key)
    throw new Error('Paste the host’s shared address and access key together.');
  return { address: lanAddress(address), key: accessKey(key) };
}
