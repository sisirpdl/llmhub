/** The shared storage, inference and interchange payload. UI metadata lives outside it. */
export type ContentPart = {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: string };
  [key: string]: unknown;
};
export type ChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content?: string | ContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }[];
  [key: string]: unknown;
};
export type ChatDocument = { model: string; messages: ChatMessage[] };
export const MAX_CHAT_BYTES = 32 * 1024 * 1024;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function validateDocument(
  value: unknown,
): asserts value is ChatDocument {
  if (
    !record(value) ||
    typeof value.model !== 'string' ||
    !value.model.trim() ||
    value.model.length > 512
  )
    throw new Error(
      'Expected a JSON object with a model name and a messages array.',
    );
  if (!Array.isArray(value.messages) || value.messages.length > 10000)
    throw new Error('Messages must be an array with at most 10,000 entries.');
  for (const m of value.messages) {
    if (
      !record(m) ||
      !['system', 'developer', 'user', 'assistant', 'tool'].includes(
        String(m.role),
      )
    )
      throw new Error('Every message needs a valid OpenAI role.');
    if (
      m.content !== undefined &&
      m.content !== null &&
      typeof m.content !== 'string'
    ) {
      if (
        !Array.isArray(m.content) ||
        !m.content.every(
          part =>
            record(part) &&
            typeof part.type === 'string' &&
            (part.type !== 'text' || typeof part.text === 'string') &&
            (part.type !== 'image_url' ||
              (record(part.image_url) &&
                typeof part.image_url.url === 'string')),
        )
      )
        throw new Error(
          'Message content must be text or valid typed content parts.',
        );
    }
    if (m.role !== 'assistant' && m.content == null)
      throw new Error('Only assistant messages may omit content.');
    if (m.name !== undefined && typeof m.name !== 'string')
      throw new Error('Message name must be text.');
    if (m.tool_calls !== undefined) {
      if (
        m.role !== 'assistant' ||
        !Array.isArray(m.tool_calls) ||
        !m.tool_calls.length ||
        !m.tool_calls.every(
          call =>
            record(call) &&
            typeof call.id === 'string' &&
            call.id.length > 0 &&
            call.type === 'function' &&
            record(call.function) &&
            typeof call.function.name === 'string' &&
            typeof call.function.arguments === 'string',
        )
      )
        throw new Error('Invalid assistant tool_calls.');
    }
    if (
      m.role === 'tool' &&
      (typeof m.tool_call_id !== 'string' || !m.tool_call_id)
    )
      throw new Error('Tool messages need tool_call_id.');
    if (m.role === 'assistant' && m.content == null && !m.tool_calls)
      throw new Error('Assistant messages need content or tool_calls.');
  }
}
export function parseChat(text: string): ChatDocument {
  if (text.length > MAX_CHAT_BYTES)
    throw new Error('Chat files must be smaller than 32 MiB.');
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  validateDocument(value);
  if (Object.keys(value).some(key => key !== 'model' && key !== 'messages'))
    throw new Error(
      'Use the single-chat format with only model and messages at the top level.',
    );
  return value;
}
export function messageText(message: ChatMessage): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content || [])
    .filter(part => part.type === 'text')
    .map(part => part.text || '')
    .join('\n');
}
export function imageUrls(message: ChatMessage): string[] {
  return Array.isArray(message.content)
    ? message.content.flatMap(part =>
        part.type === 'image_url' && part.image_url ? [part.image_url.url] : [],
      )
    : [];
}
export const hasTurns = (doc: ChatDocument) =>
  doc.messages.some(m => !['system', 'developer'].includes(m.role));
export function portableDocument(doc: ChatDocument): ChatDocument {
  // No schema converter: metadata is outside this payload, and messages keep their shape.
  return { model: doc.model, messages: doc.messages };
}
