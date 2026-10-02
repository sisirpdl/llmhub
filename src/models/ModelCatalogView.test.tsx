import Renderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ModelCatalogView } from './ModelCatalogView';
import { ModelSuggestion } from './ModelSuggestion';
import { VisionSetupSheet } from './VisionSetupSheet';
import { SUPPORTED_MODELS } from './modelCatalog';
import { SUPPORTED_VISION_MODELS } from './visionCatalog';
import { Button } from '../ui/Controls';
import { darkColors } from '../ui/theme';
import type { ModelController } from '../app/useModelController';
import type { AppController } from '../app/AppController';
jest.mock('../app/useModelController', () => ({
  isVision: (model: { kind?: string }) => model.kind === 'vision',
}));
jest.mock('./importedModels', () => ({
  isImported: (model: object) => 'origin' in model,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const textModel = SUPPORTED_MODELS[0];
const visionModel = SUPPORTED_VISION_MODELS[0];
let renderer: Renderer.ReactTestRenderer;
let controller: ModelController;
const discover = jest.fn();
const text = () =>
  renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
beforeEach(() => {
  jest.clearAllMocks();
  controller = {
    catalog: [textModel, visionModel],
    states: {
      [textModel.id]: 'not-downloaded',
      [visionModel.id]: 'not-downloaded',
    },
    progress: {},
    errors: {},
    freeSpace: 10e9,
    importing: false,
    generationActive: false,
    download: jest.fn().mockResolvedValue(undefined),
    setNotice: jest.fn(),
  } as unknown as ModelController;
});
afterEach(async () => {
  await Renderer.act(async () => renderer?.unmount());
});
async function catalog() {
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <ModelCatalogView
        controller={controller}
        colors={darkColors}
        onDiscover={discover}
        onChat={() => {}}
      />,
    );
  });
}
test('empty catalog offers one text suggestion without a download section or vision promotion', async () => {
  await catalog();
  expect(text()).toContain('Your models');
  expect(text()).toContain('Get started with text chat');
  expect(text()).not.toContain('Available to Download');
  expect(text()).not.toContain(visionModel.displayName);
  expect(renderer.root.findAllByType(ModelSuggestion)).toHaveLength(1);
});
test('starting a suggestion moves it to Your models and preserves retry failures', async () => {
  await catalog();
  await Renderer.act(async () => {
    renderer.root.findByType(Button).props.onPress();
  });
  expect(controller.download).toHaveBeenCalledWith(textModel);
  controller = {
    ...controller,
    states: { ...controller.states, [textModel.id]: 'downloading' },
    progress: { [textModel.id]: { bytes: 100, total: 1000 } },
  };
  await Renderer.act(async () => {
    renderer.update(
      <ModelCatalogView
        controller={controller}
        colors={darkColors}
        onDiscover={discover}
        onChat={() => {}}
      />,
    );
  });
  expect(renderer.root.findAllByType(ModelSuggestion)).toHaveLength(0);
  expect(text()).toContain('Downloading');
  controller = {
    ...controller,
    states: { ...controller.states, [textModel.id]: 'failed' },
    errors: { [textModel.id]: 'Network interrupted' },
  };
  await Renderer.act(async () => {
    renderer.update(
      <ModelCatalogView
        controller={controller}
        colors={darkColors}
        onDiscover={discover}
        onChat={() => {}}
      />,
    );
  });
  expect(text()).toContain('Retry download');
  expect(text()).toContain('Network interrupted');
});
test('an installed text model hides suggestions and does not promote missing vision', async () => {
  controller.states[textModel.id] = 'ready';
  await catalog();
  expect(renderer.root.findAllByType(ModelSuggestion)).toHaveLength(0);
  expect(text()).toContain(textModel.displayName);
  expect(text()).not.toContain(visionModel.displayName);
});
test('low storage disables the recommendation but browsing remains available', async () => {
  controller.freeSpace = 0;
  await catalog();
  expect(renderer.root.findByType(Button).props.disabled).toBe(true);
  expect(text()).toContain('more storage');
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Find another model' })
      .props.onPress();
  });
  expect(discover).toHaveBeenCalled();
});
test('vision prompt includes combined size and moves its download to the models screen', async () => {
  const app = {
    models: controller,
    colors: darkColors,
    visionSetupVisible: true,
    setVisionSetupVisible: jest.fn(),
    setRoute: jest.fn(),
    setDiscoveryVisible: jest.fn(),
  } as unknown as AppController;
  await Renderer.act(async () => {
    renderer = Renderer.create(<VisionSetupSheet app={app} />);
  });
  expect(text()).toContain('Includes vision projector');
  await Renderer.act(async () => {
    renderer.root.findByType(Button).props.onPress();
  });
  expect(controller.download).toHaveBeenCalledWith(visionModel);
  expect(app.setRoute).toHaveBeenCalledWith('models');
  expect(app.setVisionSetupVisible).toHaveBeenCalledWith(false);
});
test('installed vision is offered for loading instead of another download; failures keep the prompt open', async () => {
  controller.states[visionModel.id] = 'ready';
  const app = {
    models: controller,
    colors: darkColors,
    visionSetupVisible: true,
    setVisionSetupVisible: jest.fn(),
    switchModel: jest.fn().mockResolvedValue(false),
  } as unknown as AppController;
  await Renderer.act(async () => {
    renderer = Renderer.create(<VisionSetupSheet app={app} />);
  });
  expect(renderer.root.findAllByType(ModelSuggestion)).toHaveLength(0);
  await Renderer.act(async () => {
    renderer.root.findByType(Button).props.onPress();
  });
  expect(app.switchModel).toHaveBeenCalledWith(visionModel);
  expect(app.setVisionSetupVisible).not.toHaveBeenCalled();
  (app.switchModel as jest.Mock).mockResolvedValue(true);
  await Renderer.act(async () => {
    renderer.root.findByType(Button).props.onPress();
  });
  expect(app.setVisionSetupVisible).toHaveBeenCalledWith(false);
});
