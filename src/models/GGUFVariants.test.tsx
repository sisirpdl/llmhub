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
  expect(text()).toContain('Open All to browse without the size filter');
  expect(text()).not.toContain('No variants fit the estimated RAM budget');
});
test('browses and enables downloads without requesting GGUF metadata', async () => {
  const reader = readGGUFMetadata as jest.Mock;
  reader.mockClear();
  await renderVariants();
  await Renderer.act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: `Select ${file.path}` })
      .props.onPress(),
  );
  expect(reader).not.toHaveBeenCalled();
  expect(renderer.root.findByType(Button).props.disabled).toBe(false);
  expect(text()).toContain('79% of the app’s RAM budget');
  expect(text()).not.toContain('Checking variants');
});

test('uses the app budget rather than total RAM and keeps a manual All option', async () => {
  await renderVariants({
    ...details,
    files: [{ ...file, path: 'above.gguf', size: 4 * 1024 ** 3 }],
  });
  expect(text()).toContain('No variants are within 79%');
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: 'Select above.gguf' }),
  ).toHaveLength(0);
  await Renderer.act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Show all variants' })
      .props.onPress(),
  );
  await Renderer.act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Select above.gguf' })
      .props.onPress(),
  );
  expect(text()).toContain('Above size limit');
  expect(renderer.root.findByType(Button).props.disabled).toBe(false);
});

test('longer context does not change the size filter or pretend to measure RAM', async () => {
  await renderVariants({ ...details, files: [file] });
  await Renderer.act(async () =>
    renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(node =>
        node.findAllByType(Text).some(t => t.props.children === '8K'),
      )!
      .props.onPress(),
  );
  expect(
    renderer.root.findByProps({ accessibilityLabel: `Select ${file.path}` }),
  ).toBeDefined();
  expect(text()).toContain('longer context uses more memory');
  expect(text()).not.toContain('RAM at');
});

test('the vision size filter includes the selected projector', async () => {
  const projector = {
    ...file,
    path: 'mmproj.gguf',
    size: 1024 ** 3,
    projector: true,
  };
  const { Switch } = require('react-native');
  await renderVariants({
    ...details,
    files: [{ ...file, size: 3 * 1024 ** 3 }, projector],
  });
  await Renderer.act(async () =>
    renderer.root.findByType(Switch).props.onValueChange(true),
  );
  expect(text()).toContain('Choose a vision projector');
  await Renderer.act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Select projector mmproj.gguf' })
      .props.onPress(),
  );
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: `Select ${file.path}` }),
  ).toHaveLength(0);
  expect(text()).toContain('No variants are within 79%');
});

test('unknown sizes and split files stay out of the default filter', async () => {
  await renderVariants({
    ...details,
    files: [
      { ...file, size: 0 },
      { ...file, path: 'split.gguf', split: true },
    ],
  });
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: `Select ${file.path}` }),
  ).toHaveLength(0);
  await Renderer.act(async () =>
    renderer.root
      .findByProps({ accessibilityLabel: 'Show all variants' })
      .props.onPress(),
  );
  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Select split.gguf' }).props
      .disabled,
  ).toBe(true);
  expect(text()).toContain('Model download size is unavailable');
});
