import { Text } from 'react-native';
import { readDeviceMemory } from '../device/memory';
import { readGGUFMetadata } from './ggufMetadata';
import Renderer from 'react-test-renderer';
import { Button } from '../ui/Controls';
import { GGUFVariants } from './GGUFVariants';
import { darkColors } from '../ui/theme';
import type { ModelController } from '../app/useModelController';
import type { HubDetails } from './huggingFace';
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

async function renderVariants(variantDetails = details) {
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <GGUFVariants
        details={variantDetails}
        token=""
        controller={
          {
            freeSpace: 100 * 1024 ** 3,
            addRemote: jest.fn(),
          } as unknown as ModelController
        }
        colors={darkColors}
        onImported={() => {}}
      />,
    );
  });
}
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
test('explains missing device memory without claiming the models are too large', async () => {
  (readDeviceMemory as jest.Mock).mockResolvedValueOnce(null);
  await renderVariants();
  expect(text()).toContain('Device RAM could not be checked');
  expect(text()).toContain('Unknown does not mean incompatible');
  expect(text()).not.toContain('No variants fit the estimated RAM budget');
});
test('explains missing GGUF metadata and exposes the reason under All', async () => {
  (readGGUFMetadata as jest.Mock)
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);
  await renderVariants();
  expect(text()).toContain('RAM requirements could not be estimated');
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Show all variants' })
      .props.onPress();
  });
  expect(text()).toContain(
    'GGUF metadata is unavailable or its architecture cannot be estimated',
  );
});
test('does not offer lower context when model weights alone exceed the budget', async () => {
  await renderVariants({ ...details, files: [details.files[1]] });
  expect(text()).toContain('No variants fit the estimated RAM budget');
  expect(text()).not.toContain('estimated to fit');
});
test('suggests and applies a smaller context only when it predicts a supported fit', async () => {
  (readGGUFMetadata as jest.Mock).mockResolvedValueOnce({
    architecture: 'qwen2',
    layers: 64,
    kvHeads: 16,
    keyLength: 128,
    valueLength: 128,
    maxContext: 8192,
  });
  await renderVariants({ ...details, files: [file] });
  await Renderer.act(async () => {
    renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(node =>
        node.findAllByType(Text).some(t => t.props.children === '8K'),
      )!
      .props.onPress();
  });
  expect(text()).toContain('No variants fit the estimated RAM budget');
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Use 4096 context tokens' })
      .props.onPress();
  });
  expect(
    renderer.root.findByProps({
      accessibilityLabel: 'Select small-Q4_K_M.gguf',
    }),
  ).toBeDefined();
});
