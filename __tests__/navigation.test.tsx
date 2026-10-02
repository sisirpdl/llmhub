import React from 'react';
import Renderer from 'react-test-renderer';
import { Platform, ActionSheetIOS } from 'react-native';
import { exportChat, importChatFile } from '../src/chat/chatTransfer';
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
jest.mock('../src/chat/chatTransfer', () => ({
  exportChat: jest.fn().mockResolvedValue(true),
  importChatFile: jest.fn().mockResolvedValue(null),
}));
let app: AppController;
function Harness({ platform }: { platform: 'ios' | 'android' }) {
  Object.defineProperty(Platform, 'OS', {
    value: platform,
    configurable: true,
  });
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
  ).toBe(3);
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

test('Android chat menu exports, sidebar imports, and App Info lives at the end of Settings', async () => {
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="android" />);
  });
  await Renderer.act(async () => {
    app.setRoute('chat');
  });
  expect(
    renderer!.root.findAllByProps({ accessibilityLabel: 'Open chat settings' }),
  ).toHaveLength(0);
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Open chat menu' }).props
      .onPress,
  ).toBe(app.openChatMenu);
  await Renderer.act(async () => {
    app.setChatMenuVisible(true);
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Export chat' }),
  ).toBeDefined();
  expect(app.chatSettingsVisible).toBe(false);
  await Renderer.act(async () => {
    app.setChatMenuVisible(false);
    renderer!.root
      .findByProps({ accessibilityLabel: 'Open navigation menu' })
      .props.onPress();
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Import chat' }),
  ).toBeDefined();
  expect(
    renderer!.root
      .findAllByType('Text' as never)
      .filter(n => n.props.children === 'App Info'),
  ).toHaveLength(0);
  await Renderer.act(async () => {
    app.setRoute('settings');
  });
  const labels = renderer!.root
    .findAllByType('Text' as never)
    .map(n => n.props.children);
  expect(labels.indexOf('App Info')).toBeGreaterThan(labels.indexOf('Privacy'));
  await Renderer.act(async () => renderer!.unmount());
});

test('iOS exposes import in conversation history and retains only three tabs', async () => {
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="ios" />);
  });
  await Renderer.act(async () => {
    app.setHistoryVisible(true);
  });
  expect(
    renderer!.root.findByProps({ accessibilityLabel: 'Import chat' }),
  ).toBeDefined();
  expect(
    renderer!.root
      .findAllByProps({ accessibilityRole: 'tab' })
      .every(n => n.props.accessibilityLabel !== 'App Info'),
  ).toBe(true);
  await Renderer.act(async () => renderer!.unmount());
});

test('Android export saves the current canonical chat; sidebar import opens a new conversation', async () => {
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="android" />);
  });
  await Renderer.act(async () => {
    app.setRoute('chat');
  });
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Open chat menu' })
      .props.onPress();
  });
  await Renderer.act(async () => {
    await renderer!.root
      .findByProps({ accessibilityLabel: 'Export chat' })
      .props.onPress();
  });
  expect(exportChat).toHaveBeenCalledWith(
    app.chat.exportDocument(),
    'New chat',
  );
  expect(app.chatSettingsVisible).toBe(false);
  const doc = {
    model: 'imported-model',
    messages: [{ role: 'user' as const, content: 'Imported topic' }],
  };
  (importChatFile as jest.Mock).mockResolvedValueOnce({
    document: doc,
    images: [],
  });
  await Renderer.act(async () => {
    await app.importChat();
  });
  expect(app.route).toBe('chat');
  expect(app.chat.title).toBe('Imported topic');
  expect(app.chat.exportDocument()).toEqual(doc);
  expect(app.transfer).toBeNull();
  await Renderer.act(async () => renderer!.unmount());
});

test('iOS chat menu uses a native action sheet with export instead of model settings', async () => {
  let callback: (index: number) => void = () => {};
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((_options, cb) => {
      callback = cb;
    });
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness platform="ios" />);
  });
  await Renderer.act(async () => {
    app.setRoute('chat');
  });
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Open chat menu' })
      .props.onPress();
  });
  expect(sheet).toHaveBeenCalledWith(
    {
      options: ['Cancel', 'Export chat', 'Chat documents'],
      cancelButtonIndex: 0,
    },
    expect.any(Function),
  );
  await Renderer.act(async () => {
    callback(1);
  });
  expect(app.chatSettingsVisible).toBe(false);
  expect(app.transfer).toBeNull();
  await Renderer.act(async () => renderer!.unmount());
  sheet.mockRestore();
});
