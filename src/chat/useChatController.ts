import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { LlamaContext, TokenData } from 'llama.rn';
import { saveChatImage, removeChatImages } from './attachments';
import {
  defaultsFor,
  validateSettings,
  DEFAULT_SYSTEM_PROMPT,
  type ModelSettings,
} from '../settings/modelSettings';
import { buildPrompt } from './promptBuilder';
import type { ModelManifest } from '../models/modelCatalog';
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUri?: string;
  modelId?: string;
  modelName?: string;
  event?: 'model-switch';
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  customTitle?: boolean;
  systemPrompt?: string;
  lastModelId?: string;
  lastModelName?: string;
  messages: Message[];
};
const HISTORY_KEY = '@llmhub/conversations-v2';
const LEGACY_KEY = '@llmhub/conversation';
const fresh = (): Conversation => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New chat',
  updatedAt: Date.now(),
  messages: [],
});
function validMessages(value: unknown): value is Message[] {
  return (
    Array.isArray(value) &&
    value.every(
      m =>
        m &&
        typeof m.id === 'string' &&
        ['user', 'assistant', 'system'].includes(m.role) &&
        typeof m.content === 'string' &&
        (m.imageUri === undefined ||
          (typeof m.imageUri === 'string' &&
            m.imageUri.startsWith('file://'))) &&
        (m.event === undefined || m.event === 'model-switch'),
    )
  );
}
export function useChatController({
  context,
  model,
  vision,
  onGenerationStateChange,
  settings: suppliedSettings,
  contextLength,
  onImagePickerStateChange,
}: {
  context: LlamaContext | null;
  model: ModelManifest;
  vision: boolean;
  onGenerationStateChange?: (active: boolean) => void;
  settings?: ModelSettings;
  contextLength?: number | null;
  onImagePickerStateChange?: (active: boolean) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [omittedNotice, setOmittedNotice] = useState(false);
  const settings = suppliedSettings || defaultsFor(model);
  const [loaded, setLoaded] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const buffer = useRef('');
  const assistant = useRef<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const busy = useRef(false);
  const interrupted = useRef(false);
  const history = conversations
    .filter(c => c.messages.length)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const conversation = conversations.find(c => c.id === currentId);
  const messages = conversation?.messages || [];

  useEffect(() => {
    let disposed = false;
    async function restore() {
      try {
        const saved = await AsyncStorage.getItem(HISTORY_KEY);
        let items: Conversation[] = [];
        let id = '';
        if (saved) {
          const data = JSON.parse(saved);
          if (
            !Array.isArray(data.conversations) ||
            !data.conversations.every(
              (c: Conversation) =>
                typeof c.id === 'string' &&
                typeof c.title === 'string' &&
                typeof c.updatedAt === 'number' &&
                validMessages(c.messages) &&
                (c.systemPrompt === undefined ||
                  typeof c.systemPrompt === 'string') &&
                (c.customTitle === undefined ||
                  typeof c.customTitle === 'boolean'),
            )
          )
            throw new Error('Invalid history');
          items = data.conversations;
          id = data.currentId;
        } else {
          const old = await AsyncStorage.getItem(LEGACY_KEY);
          if (old) {
            const restored = JSON.parse(old);
            if (!validMessages(restored))
              throw new Error('Invalid conversation');
            const migrated = fresh();
            migrated.messages = restored;
            migrated.title =
              restored.find(m => m.role === 'user')?.content.slice(0, 60) ||
              migrated.title;
            items = [migrated];
            id = migrated.id;
          }
        }
        if (!items.length) {
          const initial = fresh();
          items = [initial];
          id = initial.id;
        }
        if (!disposed) {
          setConversations(items);
          setCurrentId(items.some(c => c.id === id) ? id : items[0].id);
          setLoaded(true);
        }
      } catch {
        if (!disposed) {
          setError(
            'Saved chats could not be restored. Restart the app to retry.',
          ); /* Do not overwrite unreadable history. */
        }
      }
    }
    restore();
    return () => {
      disposed = true;
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);

  // Debounce disk writes during streaming; final output and navigation persist immediately.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(
      () => {
        AsyncStorage.setItem(
          HISTORY_KEY,
          JSON.stringify({ currentId, conversations }),
        ).catch(() => setError('Chats could not be saved.'));
      },
      sending ? 500 : 0,
    );
    return () => clearTimeout(timer);
  }, [conversations, currentId, loaded, sending]);
  useEffect(() => {
    onGenerationStateChange?.(sending);
  }, [onGenerationStateChange, sending]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && busy.current) {
        interrupted.current = true;
        setError(
          'Generation was interrupted when the app left the foreground. The partial response was kept.',
        );
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!context || !loaded || busy.current) return;
    setConversations(current =>
      current.map(c => {
        if (
          c.id !== currentId ||
          !c.lastModelId ||
          c.lastModelId === model.id ||
          !c.messages.length
        )
          return c;
        return {
          ...c,
          lastModelId: model.id,
          lastModelName: model.displayName,
          updatedAt: Date.now(),
          messages: [
            ...c.messages,
            {
              id: `${Date.now()}-switch-${model.id}`,
              role: 'system',
              event: 'model-switch',
              content: `Switched to ${model.displayName}`,
              modelId: model.id,
              modelName: model.displayName,
            },
          ],
        };
      }),
    );
  }, [context, loaded, currentId, model.id, model.displayName]);

  const flush = useCallback(() => {
    frame.current = null;
    const target = assistant.current;
    if (!target) return;
    const content = buffer.current;
    setConversations(current =>
      current.map(c =>
        c.id === target.conversationId
          ? {
              ...c,
              messages: c.messages.map(m =>
                m.id === target.messageId ? { ...m, content } : m,
              ),
            }
          : c,
      ),
    );
  }, []);
  function queueToken(data: TokenData) {
    if (!assistant.current) return;
    buffer.current += data.token || data.content || '';
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  }
  async function sendMessage() {
    const content = draft.trim();
    if ((!content && !imageUri) || !context || busy.current || !loaded) return;
    const invalid = validateSettings(settings);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (imageUri && !vision) {
      setError('Choose a vision model or remove the attached image.');
      return;
    }
    busy.current = true;
    interrupted.current = false;
    const user: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: content || 'Describe this image.',
      ...(imageUri ? { imageUri } : {}),
    };
    const reply: Message = {
      id: `${Date.now()}-assistant`,
      role: 'assistant',
      content: '',
      modelId: model.id,
      modelName: model.displayName,
    };
    const switched =
      conversation?.lastModelId && conversation.lastModelId !== model.id;
    const divider: Message = {
      id: `${Date.now()}-switch`,
      role: 'system',
      content: `Switched to ${model.displayName}`,
      event: 'model-switch',
      modelId: model.id,
      modelName: model.displayName,
    };
    const turns = [...messages, ...(switched ? [divider] : []), user];
    setConversations(current =>
      current.map(c =>
        c.id === currentId
          ? {
              ...c,
              title:
                c.customTitle || c.messages.some(m => m.role === 'user')
                  ? c.title
                  : user.content.slice(0, 60),
              lastModelId: model.id,
              lastModelName: model.displayName,
              updatedAt: Date.now(),
              messages: [...turns, reply],
            }
          : c,
      ),
    );
    setDraft('');
    setImageUri(null);
    setError('');
    setSending(true);
    assistant.current = { conversationId: currentId, messageId: reply.id };
    buffer.current = '';
    try {
      const promptTurns = [
        {
          role: 'system' as const,
          content: conversation?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        },
        ...turns.filter(m => !m.event && m.role !== 'system'),
      ];
      const result = buildPrompt(
        promptTurns,
        model.promptTemplateId,
        contextLength || settings.contextLength,
        settings.maxTokens,
      );
      setOmittedNotice(
        result.omittedMessageCount > 0 || result.truncatedMessage,
      );
      const params = {
        n_predict: settings.maxTokens,
        temperature: settings.temperature,
        top_p: settings.topP,
        top_k: settings.topK,
        min_p: settings.minP,
        penalty_repeat: settings.repeatPenalty,
        seed: settings.seed,
      };
      const formatted = result.messages.map(message => {
        const attachment =
          'imageUri' in message ? (message.imageUri as string) : undefined;
        return attachment && vision
          ? {
              role: message.role,
              content: [
                { type: 'text' as const, text: message.content },
                { type: 'image_url' as const, image_url: { url: attachment } },
              ],
            }
          : { role: message.role, content: message.content };
      });
      const completion = await context.completion(
        {
          ...params,
          ...(model.promptTemplateId === 'native' ||
          (vision && formatted.some(m => Array.isArray(m.content)))
            ? { messages: formatted }
            : { prompt: result.prompt }),
        },
        queueToken,
      );
      if (!buffer.current) buffer.current = completion.text || '';
    } catch (e) {
      if (!interrupted.current)
        setError(
          e instanceof Error
            ? e.message
            : 'Generation failed. Try sending the message again.',
        );
    } finally {
      if (frame.current) cancelAnimationFrame(frame.current);
      flush();
      assistant.current = null;
      busy.current = false;
      setSending(false);
    }
  }
  async function stopGeneration() {
    if (!context || !busy.current) return;
    interrupted.current = true;
    await context.stopCompletion().catch(() => {});
    if (frame.current) cancelAnimationFrame(frame.current);
    flush();
    setError('Generation stopped. The partial response was kept.');
  }
  function newConversation() {
    if (busy.current || !loaded) return;
    if (!messages.length && !conversation?.customTitle) {
      if (imageUri) removeChatImages([imageUri]).catch(() => {});
      setDraft('');
      setImageUri(null);
      return;
    }
    if (imageUri) removeChatImages([imageUri]).catch(() => {});
    const next = fresh();
    setConversations(current => [
      ...current.filter(c => c.messages.length || c.customTitle),
      next,
    ]);
    setCurrentId(next.id);
    setDraft('');
    setError('');
    setImageUri(null);
    setOmittedNotice(false);
  }
  function selectConversation(id: string) {
    if (busy.current) return;
    if (imageUri) removeChatImages([imageUri]).catch(() => {});
    setCurrentId(id);
    setDraft('');
    setImageUri(null);
    setError('');
    setOmittedNotice(false);
  }
  function resetConversation() {
    if (busy.current) return;
    Alert.alert(
      'Clear conversation?',
      'All messages in this conversation will be removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setConversations(current =>
              current.map(c =>
                c.id === currentId
                  ? {
                      ...c,
                      messages: [],
                      title: 'New chat',
                      customTitle: false,
                      lastModelId: undefined,
                      lastModelName: undefined,
                    }
                  : c,
              ),
            );
            removeChatImages(
              messages.flatMap(m => (m.imageUri ? [m.imageUri] : [])),
            ).catch(() => {});
            setError('');
            setOmittedNotice(false);
            AsyncStorage.removeItem(LEGACY_KEY).catch(() => {});
          },
        },
      ],
    );
  }
  async function attachImage() {
    if (!vision || !context || busy.current) return;
    onImagePickerStateChange?.(true);
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        maxWidth: 2048,
        maxHeight: 2048,
        quality: 0.8,
      });
      if (result.errorCode) {
        setError(
          result.errorMessage ||
            'Photo access failed. Check photo permissions.',
        );
        return;
      }
      if (result.assets?.[0]?.uri) {
        const saved = await saveChatImage(result.assets[0].uri);
        if (imageUri) removeChatImages([imageUri]).catch(() => {});
        setImageUri(saved);
        setError('');
      }
    } catch {
      setError(
        'Unable to save this photo. Check permissions and available storage.',
      );
    } finally {
      onImagePickerStateChange?.(false);
    }
  }
  function renameConversation(title: string) {
    if (busy.current || !loaded) return;
    const value = title.trim().slice(0, 80);
    if (!value) return;
    setConversations(current =>
      current.map(c =>
        c.id === currentId
          ? { ...c, title: value, customTitle: true, updatedAt: Date.now() }
          : c,
      ),
    );
  }
  function setSystemPrompt(value: string) {
    if (busy.current) return;
    setConversations(current =>
      current.map(c =>
        c.id === currentId
          ? { ...c, systemPrompt: value.trim() || DEFAULT_SYSTEM_PROMPT }
          : c,
      ),
    );
  }
  function removeAttachment() {
    if (imageUri) removeChatImages([imageUri]).catch(() => {});
    setImageUri(null);
  }
  return {
    title: conversation?.title || 'New chat',
    systemPrompt: conversation?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    renameConversation,
    setSystemPrompt,
    removeAttachment,
    hasImageHistory: messages.some(m => m.imageUri),
    imageContextUnavailable: !vision && messages.some(m => m.imageUri),
    modelName: context ? model.displayName : null,
    modelId: model.id,
    messages,
    history,
    currentId,
    draft,
    setDraft,
    sending,
    loaded,
    error,
    omittedNotice,
    imageUri,
    setImageUri,
    sendMessage,
    stopGeneration,
    newConversation,
    selectConversation,
    resetConversation,
    attachImage,
  };
}
export type ChatController = ReturnType<typeof useChatController>;
