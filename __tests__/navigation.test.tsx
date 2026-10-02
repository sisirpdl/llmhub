import React from 'react';
import Renderer from 'react-test-renderer';
import { useAppController, type AppController } from '../src/app/AppController';
import AndroidAppShell from '../src/app/AppShell.android';
import IOSAppShell from '../src/app/AppShell.ios';
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { hash: jest.fn() } },
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    getFSInfo: jest.fn().mockResolvedValue({ freeSpace: 10_000_000_000 }),
    exists: jest.fn().mockResolvedValue(false),
  },
}));
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(),
  getBackendDevicesInfo: jest.fn().mockResolvedValue([]),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
let app: AppController;
function Harness({ platform }: { platform: 'ios' | 'android' }) {
  app = useAppController();
  return platform === 'ios' ? (
    <IOSAppShell app={app} />
  ) : (
    <AndroidAppShell app={app} />
  );
}
test('Android drawer navigates to chat and exposes a model picker', async () => {
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="android" />);
  });
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Open navigation menu' })
      .props.onPress();
  });
  const destination = renderer!.root
    .findAllByProps({ accessibilityRole: 'button' })
    .find(node =>
      node
        .findAllByType('Text' as never)
        .some(text => text.props.children === 'Chat'),
    );
  expect(destination).toBeDefined();
  await Renderer.act(async () => {
    destination!.props.onPress();
  });
  expect(app.route).toBe('chat');
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Choose chat model' })
      .props.onPress();
  });
  expect(app.pickerVisible).toBe(true);
  await Renderer.act(async () => renderer!.unmount());
});
test('iOS uses bottom tabs and conversation history instead of a drawer', async () => {
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="ios" />);
  });
  expect(
    new Set(
      renderer!.root
        .findAllByProps({ accessibilityRole: 'tab' })
        .map(node => node.props.accessibilityLabel),
    ).size,
  ).toBe(4);
  expect(
    renderer!.root.findAllByProps({
      accessibilityLabel: 'Open navigation menu',
    }),
  ).toHaveLength(0);
  await Renderer.act(async () => {
    renderer!.root
      .findAllByProps({ accessibilityRole: 'tab' })
      .find(node => node.props.accessibilityLabel === 'Chat')!
      .props.onPress();
  });
  expect(app.route).toBe('chat');
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Show conversations' })
      .props.onPress();
  });
  expect(app.historyVisible).toBe(true);
  await Renderer.act(async () => renderer!.unmount());
});

test.each(['android', 'ios'] as const)(
  '%s offers vision setup when attaching without a loaded vision model',
  async platform => {
    let renderer: Renderer.ReactTestRenderer;
    await Renderer.act(async () => {
      renderer = Renderer.create(<Harness platform={platform} />);
    });
    await Renderer.act(async () => {
      app.setRoute('chat');
    });
    await Renderer.act(async () => {
      renderer!.root
        .findByProps({ accessibilityLabel: 'Attach image' })
        .props.onPress();
    });
    expect(app.visionSetupVisible).toBe(true);
    expect(app.route).toBe('chat');
    await Renderer.act(async () => renderer!.unmount());
  },
);
