import Renderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  defaultsFor,
  useModelSettings,
  validateSettings,
} from './modelSettings';
import { ModelSettingsSheet } from './ModelSettingsSheet';
import { SUPPORTED_MODELS } from '../models/modelCatalog';
import { darkColors } from '../ui/theme';
import { Button } from '../ui/Controls';
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let renderer: Renderer.ReactTestRenderer;
let settings: ReturnType<typeof useModelSettings>;
const model = SUPPORTED_MODELS[0];
function Harness() {
  settings = useModelSettings();
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
});
afterEach(async () => {
  if (renderer) await Renderer.act(async () => renderer.unmount());
});
test('validates ranges and leaves space for the prompt', () => {
  expect(validateSettings(defaultsFor(model))).toBeNull();
  expect(validateSettings({ ...defaultsFor(model), topP: 2 })).toContain(
    'Top-p',
  );
  expect(
    validateSettings({ ...defaultsFor(model), maxTokens: 2048 }),
  ).toContain('context');
});
test('saves profiles independently and does not apply a failed persistence write', async () => {
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  const changed = { ...defaultsFor(model), temperature: 0.2 };
  await Renderer.act(async () => {
    await settings.save(model, changed);
  });
  expect(settings.forModel(model).temperature).toBe(0.2);
  expect(settings.forModel({ ...model, id: 'other' }).temperature).toBe(0.7);
  (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
    new Error('disk error'),
  );
  await Renderer.act(async () => {
    await expect(
      settings.save(model, { ...changed, temperature: 1 }),
    ).rejects.toThrow('disk error');
  });
  expect(settings.forModel(model).temperature).toBe(0.2);
});
test('stages edits and reset until Apply; Cancel does not mutate settings', async () => {
  const apply = jest.fn().mockResolvedValue(undefined),
    close = jest.fn();
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <ModelSettingsSheet
        visible
        model={model}
        settings={defaultsFor(model)}
        systemPrompt="Custom instruction"
        onApply={apply}
        onClose={close}
        colors={darkColors}
        disabled={false}
      />,
    );
  });
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Temperature' })
      .props.onChangeText('1.2');
  });
  expect(apply).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    renderer.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Cancel')!
      .props.onPress();
  });
  expect(close).toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Reset model settings to defaults' })
      .props.onPress();
  });
  expect(
    renderer.root.findByProps({ accessibilityLabel: 'Temperature' }).props
      .value,
  ).toBe('0.7');
  await Renderer.act(async () => {
    await renderer.root
      .findAllByType(Button)
      .find(b => b.props.label === 'Apply')!
      .props.onPress();
  });
  expect(apply).toHaveBeenCalledWith(
    defaultsFor(model),
    'You are a helpful assistant.',
  );
});
