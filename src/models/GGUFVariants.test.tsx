import Renderer from 'react-test-renderer';
import { Button } from '../ui/Controls';
import { GGUFVariants } from './GGUFVariants';
import { darkColors } from '../ui/theme';
import type { ModelController } from '../app/useModelController';
import type { HubDetails } from './huggingFace';
jest.mock('../device/memory', () => ({
  readDeviceMemory: jest
    .fn()
    .mockResolvedValue({
      totalBytes: 8 * 1024 ** 3,
      availableBytes: 6 * 1024 ** 3,
      appBudgetBytes: 5 * 1024 ** 3,
    }),
}));
jest.mock('./ggufMetadata', () => ({
  readGGUFMetadata: jest
    .fn()
    .mockResolvedValue({
      architecture: 'qwen2',
      layers: 24,
      kvHeads: 2,
      keyLength: 64,
      valueLength: 64,
      maxContext: 8192,
    }),
}));
jest.mock('./importedModels', () => ({ fromHub: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const file = {
  path: 'small-Q4_K_M.gguf',
  size: 1024 ** 3,
  quantization: 'Q4_K_M',
  projector: false,
  split: false,
};
const details: HubDetails = {
  model: {
    id: 'org/model',
    name: 'model',
    author: 'org',
    downloads: 100,
    likes: 1,
    gated: false,
    vision: false,
  },
  revision: 'a'.repeat(40),
  license: 'mit',
  files: [
    file,
    {
      ...file,
      path: 'big-Q8_0.gguf',
      size: 8 * 1024 ** 3,
      quantization: 'Q8_0',
    },
  ],
};
let renderer: Renderer.ReactTestRenderer;
afterEach(async () => {
  await Renderer.act(async () => renderer.unmount());
});
test('defaults to RAM-supported files but retains them when storage is too low', async () => {
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <GGUFVariants
        details={details}
        token=""
        controller={
          {
            freeSpace: 1000,
            addRemote: jest.fn(),
          } as unknown as ModelController
        }
        colors={darkColors}
        onImported={() => {}}
      />,
    );
  });
  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Select small-Q4_K_M.gguf',
    }),
  ).toBeDefined();
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: 'Select big-Q8_0.gguf',
    }),
  ).toHaveLength(0);
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Select small-Q4_K_M.gguf' })
      .props.onPress();
  });
  expect(renderer.root.findByType(Button).props.disabled).toBe(true);
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Show all variants' })
      .props.onPress();
  });
  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Select big-Q8_0.gguf' }),
  ).toBeDefined();
});
