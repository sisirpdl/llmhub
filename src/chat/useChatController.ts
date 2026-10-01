import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import type { LlamaContext, TokenData } from 'llama.rn';
import { buildPrompt } from './promptBuilder';
import type { ModelManifest } from '../models/modelCatalog';
export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};
export type Conversation = {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
};
const HISTORY_KEY = '@llmhub/conversations-v2';
const LEGACY_KEY = '@llmhub/conversation';
const SETTINGS_KEY = '@llmhub/chat-settings';
const fresh = (): Conversation => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: 'New conversation',
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
        typeof m.content === 'string',
    )
  );
}
export function useChatController({
  context,
  model,
  vision,
  onGenerationStateChange,
}: {
  context: LlamaContext | null;
  model: ModelManifest;
  vision: boolean;
  onGenerationStateChange?: (active: boolean) => void;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [omittedNotice, setOmittedNotice] = useState(false);
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('256');
  const [loaded, setLoaded] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
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
                validMessages(c.messages),
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
    AsyncStorage.getItem(SETTINGS_KEY)
      .then(value => {
        if (disposed) return;
        if (value) {
          try {
            const settings = JSON.parse(value);
            setTemperature(String(settings.temperature ?? '0.7'));
            setMaxTokens(String(settings.maxTokens ?? '256'));
          } catch {
            setError('Saved settings could not be restored.');
          }
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        if (!disposed) setError('Saved settings could not be restored.');
      });
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
    if (settingsLoaded)
      AsyncStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ temperature, maxTokens }),
      ).catch(() => setError('Settings could not be saved.'));
  }, [settingsLoaded, temperature, maxTokens]);
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
    const temp = Number(temperature),
      tokens = Number(maxTokens);
    if (
      !Number.isFinite(temp) ||
      temp < 0 ||
      temp > 2 ||
      !Number.isInteger(tokens) ||
      tokens < 1 ||
      tokens > 4096
    ) {
      setError(
        'Temperature must be 0–2 and maximum output tokens must be 1–4096.',
      );
      return;
    }
    busy.current = true;
    interrupted.current = false;
    const uri = imageUri;
    const user: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: content || 'Describe this image.',
    };
    const reply: Message = {
      id: `${Date.now()}-assistant`,
      role: 'assistant',
      content: '',
    };
    const turns = [...messages, user];
    setConversations(current =>
      current.map(c =>
        c.id === currentId
          ? {
              ...c,
              title: c.messages.length ? c.title : user.content.slice(0, 60),
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
      const promptTurns = uri
        ? turns.map((m, i) =>
            i === turns.length - 1
              ? { ...m, content: `${m.content}\n<__media__>` }
              : m,
          )
        : turns;
      const result = buildPrompt(
        promptTurns,
        model.promptTemplateId,
        model.recommendedContextLength,
      );
      setOmittedNotice(
        result.omittedMessageCount > 0 || result.truncatedMessage,
      );
      const completion = await context.completion(
        {
          prompt: result.prompt,
          n_predict: tokens,
          temperature: temp,
          ...(uri ? { media_paths: [uri] } : {}),
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
    if (!messages.length) {
      setDraft('');
      setImageUri(null);
      return;
    }
    const next = fresh();
    setConversations(current => [
      ...current.filter(c => c.messages.length),
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
                  ? { ...c, messages: [], title: 'New conversation' }
                  : c,
              ),
            );
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
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
      });
      if (result.errorCode) {
        setError(
          result.errorMessage ||
            'Photo access failed. Check photo permissions.',
        );
        return;
      }
      if (result.assets?.[0]?.uri) {
        setImageUri(result.assets[0].uri);
        setError('');
      }
    } catch {
      setError('Unable to open photos. Check photo permissions and try again.');
    }
  }
  return {
    messages,
    history,
    currentId,
    draft,
    setDraft,
    sending,
    loaded,
    error,
    omittedNotice,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
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
