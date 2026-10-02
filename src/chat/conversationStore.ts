import { DEFAULT_SYSTEM_PROMPT } from '../settings/modelSettings';
import {
  hasTurns,
  imageUrls,
  messageText,
  validateDocument,
  type ChatDocument,
  type ChatMessage,
} from './chatDocument';
export const HISTORY_KEY = '@llmhub/conversations-v3';
export const PREVIOUS_KEY = '@llmhub/conversations-v2';
export const LEGACY_KEY = '@llmhub/conversation';
export type MessageMeta = { id: string; modelId?: string; modelName?: string };
export type SwitchEvent = MessageMeta & { before: number; content: string };
export type Conversation = ChatDocument & {
  id: string;
  title: string;
  updatedAt: number;
  customTitle?: boolean;
  messageMeta: MessageMeta[];
  switches: SwitchEvent[];
};
export type MessageItem = ChatMessage &
  MessageMeta & { event?: 'model-switch'; imageUri?: string };
export const newId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const fresh = (model: string): Conversation => ({
  id: newId(),
  title: 'New chat',
  model,
  updatedAt: Date.now(),
  messages: [{ role: 'system', content: DEFAULT_SYSTEM_PROMPT }],
  messageMeta: [{ id: newId() }],
  switches: [],
});
export function importedConversation(doc: ChatDocument): Conversation {
  return {
    ...fresh(doc.model),
    ...doc,
    title:
      messageText(
        doc.messages.find(m => m.role === 'user') || {
          role: 'user',
          content: '',
        },
      ).slice(0, 60) || 'Imported chat',
    messageMeta: doc.messages.map(() => ({ id: newId() })),
    switches: [],
  };
}
export function displayMessages(c?: Conversation): MessageItem[] {
  if (!c) return [];
  const items: MessageItem[] = [];
  const switches = new Map<number, SwitchEvent[]>();
  c.switches.forEach(s =>
    switches.set(s.before, [...(switches.get(s.before) || []), s]),
  );
  c.messages.forEach((m, index) => {
    (switches.get(index) || []).forEach(s =>
      items.push({ ...s, role: 'system', event: 'model-switch' }),
    );
    if (!['system', 'developer'].includes(m.role))
      items.push({
        ...m,
        ...c.messageMeta[index],
        event: undefined,
        imageUri: imageUrls(m).find(
          uri => uri.startsWith('file://') || uri.startsWith('data:image/'),
        ),
      });
  });
  (switches.get(c.messages.length) || []).forEach(s =>
    items.push({ ...s, role: 'system', event: 'model-switch' }),
  );
  return items;
}
export function restoreHistory(text: string): {
  currentId: string;
  conversations: Conversation[];
} {
  const data = JSON.parse(text);
  if (
    !data ||
    typeof data.currentId !== 'string' ||
    !Array.isArray(data.conversations)
  )
    throw new Error('Invalid history');
  for (const value of data.conversations) {
    validateDocument(value);
    const c = value as Conversation;
    if (
      typeof c.id !== 'string' ||
      typeof c.title !== 'string' ||
      !Number.isFinite(c.updatedAt) ||
      (c.customTitle !== undefined && typeof c.customTitle !== 'boolean') ||
      !Array.isArray(c.messageMeta) ||
      c.messageMeta.length !== c.messages.length ||
      !c.messageMeta.every((m: MessageMeta) => m && typeof m.id === 'string') ||
      !Array.isArray(c.switches) ||
      !c.switches.every(
        (s: SwitchEvent) =>
          s &&
          typeof s.id === 'string' &&
          typeof s.content === 'string' &&
          Number.isInteger(s.before) &&
          s.before >= 0 &&
          s.before <= c.messages.length,
      )
    )
      throw new Error('Invalid history metadata');
  }
  return data;
}
/** One-time migration only. The old keys remain untouched as recovery backups. */
export function migrateHistory(text: string, model: string, single = false) {
  const data = JSON.parse(text);
  const entries = single
    ? [{ ...fresh(model), messages: data }]
    : data.conversations;
  if (!Array.isArray(entries)) throw new Error('Invalid legacy history');
  const conversations = entries.map(c => {
    if (
      !c ||
      typeof c.id !== 'string' ||
      typeof c.title !== 'string' ||
      !Number.isFinite(c.updatedAt) ||
      !Array.isArray(c.messages)
    )
      throw new Error('Invalid legacy chat');
    const next = fresh(c.lastModelId || model);
    next.id = c.id;
    next.title = c.title;
    next.customTitle = c.customTitle;
    next.updatedAt = c.updatedAt;
    const system =
      c.systemPrompt ||
      c.messages.find(
        (m: { role: string; event?: string }) =>
          m.role === 'system' && !m.event,
      )?.content ||
      DEFAULT_SYSTEM_PROMPT;
    next.messages[0].content = system;
    for (const m of c.messages) {
      if (
        !m ||
        typeof m.id !== 'string' ||
        !['user', 'assistant', 'system'].includes(m.role) ||
        typeof m.content !== 'string' ||
        (m.imageUri !== undefined &&
          (typeof m.imageUri !== 'string' || !m.imageUri.startsWith('file://')))
      )
        throw new Error('Invalid legacy message');
      const meta = { id: m.id, modelId: m.modelId, modelName: m.modelName };
      if (m.event === 'model-switch')
        next.switches.push({
          ...meta,
          before: next.messages.length,
          content: m.content,
        });
      else if (m.role !== 'system') {
        next.messages.push({
          role: m.role,
          content: m.imageUri
            ? [
                { type: 'text', text: m.content },
                { type: 'image_url', image_url: { url: m.imageUri } },
              ]
            : m.content,
        });
        next.messageMeta.push(meta);
      }
    }
    if (single && hasTurns(next))
      next.title =
        messageText(next.messages.find(m => m.role === 'user')!).slice(0, 60) ||
        'Imported chat';
    validateDocument(next);
    return next;
  });
  return {
    currentId: single ? conversations[0]?.id : data.currentId,
    conversations,
  };
}
