jest.mock('../device/memory', () => ({
  readDeviceMemory: jest.fn().mockResolvedValue({
    totalBytes: 8 * 1024 ** 3,
    availableBytes: 6 * 1024 ** 3,
    appBudgetBytes: 5 * 1024 ** 3,
  }),
}));
jest.mock('./ggufMetadata', () => ({
  readGGUFMetadata: jest.fn().mockResolvedValue({
    architecture: 'qwen2',
    layers: 24,
    kvHeads: 2,
    keyLength: 64,
    valueLength: 64,
    maxContext: 8192,
  }),
}));
import { Text } from 'react-native';
import Renderer from 'react-test-renderer';
import { ModelDiscovery } from './ModelDiscovery';
import { getHubDetails, searchHub } from './huggingFace';
import { fromHub } from './importedModels';
import type { ModelController } from '../app/useModelController';
import { darkColors } from '../ui/theme';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('./huggingFace', () => ({
  ...jest.requireActual('./huggingFace'),
  getHubDetails: jest.fn(),
  searchHub: jest.fn(),
}));
jest.mock('./importedModels', () => ({
  fromHub: jest.fn().mockReturnValue({ id: 'import-selected' }),
  fromRemote: jest.fn(),
  pickGGUF: jest.fn(),
  probeSize: jest.fn(),
}));
jest.mock('../app/useModelController', () => ({}));
const model = {
  id: 'author/Model-GGUF',
  author: 'author',
  name: 'Model-GGUF',
  downloads: 1234,
  likes: 12,
  vision: false,
  gated: false,
};
const file = {
  path: 'Model-Q4_K_M.gguf',
  size: 1_000_000_000,
  quantization: 'Q4_K_M',
  projector: false,
  split: false,
};
let renderer: Renderer.ReactTestRenderer;
const addRemote = jest.fn().mockResolvedValue(true);
const onClose = jest.fn();
beforeEach(async () => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (searchHub as jest.Mock).mockResolvedValue({ models: [model], next: null });
  (getHubDetails as jest.Mock).mockResolvedValue({
    model,
    revision: 'a'.repeat(40),
    license: 'mit',
    files: [file],
  });
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <ModelDiscovery
        visible
        colors={darkColors}
        onClose={onClose}
        controller={
          { addRemote, freeSpace: 10_000_000_000 } as unknown as ModelController
        }
      />,
    );
  });
});
afterEach(async () => {
  await Renderer.act(async () => {
    renderer.unmount();
  });
  jest.useRealTimers();
});
async function browse() {
  await Renderer.act(async () => {
    renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(node =>
        node
          .findAllByType(Text)
          .some(text => text.props.children === 'Hugging Face'),
      )
      ?.props.onPress();
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
}
test('opens a repository, selects a GGUF and registers its download', async () => {
  await browse();
  expect(searchHub).toHaveBeenCalled();
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Open author/Model-GGUF' })
      .props.onPress();
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(1);
  });
  expect(getHubDetails).toHaveBeenCalledWith(model, '', expect.anything());
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Select Model-Q4_K_M.gguf' })
      .props.onPress();
  });
  const download = renderer.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(
      node =>
        typeof node.props.onPress === 'function' &&
        node
          .findAllByType(Text)
          .some(text => String(text.props.children).startsWith('Download ·')),
    );
  expect(download?.props.disabled).toBe(false);
  await Renderer.act(async () => {
    download?.props.onPress();
  });
  expect(fromHub).toHaveBeenCalledWith(
    expect.objectContaining({ model }),
    file,
    undefined,
  );
  expect(addRemote).toHaveBeenCalledWith(
    { id: 'import-selected', recommendedContextLength: 2048 },
    '',
  );
  expect(onClose).toHaveBeenCalled();
});
test('debounces query edits and cancels the pending request on close', async () => {
  await browse();
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Search Hugging Face' })
      .props.onChangeText('Qwen');
  });
  expect(searchHub).toHaveBeenCalledTimes(1);
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
  expect(searchHub).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: 'Qwen' }),
    '',
    expect.anything(),
  );
  const signal = (searchHub as jest.Mock).mock.calls[1][2];
  await Renderer.act(async () => {
    renderer.update(
      <ModelDiscovery
        visible={false}
        colors={darkColors}
        onClose={onClose}
        controller={
          { addRemote, freeSpace: 10_000_000_000 } as unknown as ModelController
        }
      />,
    );
  });
  expect(signal.aborted).toBe(true);
});

test('keeps a search query while changing rank mode and text/vision filters', async () => {
  await browse();
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Search Hugging Face' })
      .props.onChangeText('Qwen');
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
  expect(searchHub).toHaveBeenLastCalledWith(
    expect.objectContaining({
      search: 'Qwen',
      task: 'text',
      sort: 'trendingScore',
      limit: 10,
    }),
    '',
    expect.anything(),
  );
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Most downloaded' })
      .props.onPress();
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
  expect(searchHub).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: 'Qwen', sort: 'downloads', limit: 10 }),
    '',
    expect.anything(),
  );
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Show vision models' })
      .props.onPress();
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
  expect(searchHub).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: 'Qwen', task: 'vision' }),
    '',
    expect.anything(),
  );
  await Renderer.act(async () => {
    renderer.root.findByProps({ accessibilityLabel: 'Browse' }).props.onPress();
  });
  await Renderer.act(async () => {
    jest.advanceTimersByTime(350);
  });
  expect(searchHub).toHaveBeenLastCalledWith(
    expect.objectContaining({ search: 'Qwen', task: 'vision', limit: 20 }),
    '',
    expect.anything(),
  );
});
