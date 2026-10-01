import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatView } from './ChatView';
import { useChatController, type ChatController } from './useChatController';
import { SUPPORTED_MODELS } from '../models/modelCatalog';
import { darkColors } from '../ui/theme';
import type { LlamaContext } from 'llama.rn';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
let chat: ChatController;
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
afterEach(async () => {
  await ReactTestRenderer.act(async () => {
    renderers.forEach(r => r.unmount());
    renderers.length = 0;
  });
});
function Harness({
  context,
  native = false,
}: {
  context: LlamaContext | null;
  native?: boolean;
}) {
  chat = useChatController({
    context,
    model: native
      ? { ...SUPPORTED_MODELS[0], promptTemplateId: 'native' }
      : SUPPORTED_MODELS[0],
    vision: false,
  });
  return (
    <ChatView
      chat={chat}
      colors={darkColors}
      active={Boolean(context)}
      vision={false}
      onModels={() => {}}
      onPicker={() => {}}
      settingsVisible={false}
      onCloseSettings={() => {}}
    />
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
});
test('keeps sending unavailable until a model context exists', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness context={null} />);
    renderers.push(renderer);
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Send message' }).props
      .disabled,
  ).toBe(true);
});
test('streams a response and retains the conversation when starting another chat', async () => {
  const completion = jest.fn(async (_params, onToken) => {
    onToken({ token: 'local ' });
    onToken({ token: 'reply' });
    return { text: 'local reply' };
  });
  const context = {
    completion,
    stopCompletion: jest.fn(),
  } as unknown as LlamaContext;
  await ReactTestRenderer.act(async () => {
    renderers.push(ReactTestRenderer.create(<Harness context={context} />));
  });
  await ReactTestRenderer.act(async () => {
    chat.setDraft('Hello locally');
  });
  await ReactTestRenderer.act(async () => {
    await chat.sendMessage();
  });
  expect(completion.mock.calls[0][0]).not.toHaveProperty('media_paths');
  expect(chat.messages.map(m => m.content)).toEqual([
    'Hello locally',
    'local reply',
  ]);
  const original = chat.currentId;
  await ReactTestRenderer.act(async () => {
    chat.newConversation();
  });
  expect(chat.messages).toEqual([]);
  expect(chat.history[0].title).toBe('Hello locally');
  await ReactTestRenderer.act(async () => {
    chat.selectConversation(original);
  });
  expect(chat.messages[1].content).toBe('local reply');
});
test('migrates the existing saved conversation without losing its turns', async () => {
  const saved = [{ id: 'old', role: 'user', content: 'Existing conversation' }];
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async key =>
    key === '@llmhub/conversation' ? JSON.stringify(saved) : null,
  );
  await ReactTestRenderer.act(async () => {
    renderers.push(ReactTestRenderer.create(<Harness context={null} />));
  });
  expect(chat.messages).toEqual(saved);
  expect(chat.history[0].title).toBe('Existing conversation');
});
test('prevents concurrent sends and keeps a stopped partial response', async () => {
  let finish: (value: { text: string }) => void = () => {};
  const completion = jest.fn((_params, onToken) => {
    onToken({ token: 'Partial' });
    return new Promise<{ text: string }>(resolve => {
      finish = resolve;
    });
  });
  const context = {
    completion,
    stopCompletion: jest.fn(async () => {
      finish({ text: 'Partial' });
    }),
  } as unknown as LlamaContext;
  await ReactTestRenderer.act(async () => {
    renderers.push(ReactTestRenderer.create(<Harness context={context} />));
  });
  await ReactTestRenderer.act(async () => {
    chat.setDraft('Long reply');
  });
  let pending: Promise<void>;
  await ReactTestRenderer.act(async () => {
    pending = chat.sendMessage();
  });
  await ReactTestRenderer.act(async () => {
    await chat.sendMessage();
    await chat.stopGeneration();
    await pending;
  });
  expect(completion).toHaveBeenCalledTimes(1);
  expect(chat.messages[1].content).toBe('Partial');
  expect(chat.sending).toBe(false);
});

test('sends structured messages to imported model chat templates', async () => {
  const completion = jest.fn().mockResolvedValue({ text: 'Native response' });
  const context = {
    completion,
    stopCompletion: jest.fn(),
  } as unknown as LlamaContext;
  await ReactTestRenderer.act(async () => {
    renderers.push(
      ReactTestRenderer.create(<Harness context={context} native />),
    );
  });
  await ReactTestRenderer.act(async () => {
    chat.setDraft('Hello from an imported model');
  });
  await ReactTestRenderer.act(async () => {
    await chat.sendMessage();
  });
  expect(completion.mock.calls[0][0]).not.toHaveProperty('prompt');
  expect(completion.mock.calls[0][0].messages).toEqual([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello from an imported model' },
  ]);
});
