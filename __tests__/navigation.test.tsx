import React from 'react';
import Renderer from 'react-test-renderer';
import { DocumentLibraryView } from '../src/documents/DocumentLibraryView';
import { submitIssueReport } from '../src/support/submitIssueReport';
jest.mock('../src/support/submitIssueReport', () => ({
  submitIssueReport: jest.fn().mockResolvedValue('receipt'),
  reportSubmissionConfigured: () => true,
  clearPendingIssueSubmission: jest.fn(),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, ActionSheetIOS, Alert, TextInput } from 'react-native';
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
  launchCamera: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
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
        .some(text => text.props.children === 'New chat'),
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
test('iOS keeps three tabs and opens conversations from its native navigation menu', async () => {
  let renderer: Renderer.ReactTestRenderer;
  const menu = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation((options, callback) =>
      callback(options.options.indexOf('Conversations')),
    );
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
  await Renderer.act(async () => {
    renderer!.root
      .findAllByProps({ accessibilityRole: 'tab' })
      .find(node => node.props.accessibilityLabel === 'Chat')!
      .props.onPress();
  });
  expect(app.route).toBe('chat');
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({ accessibilityLabel: 'Open navigation menu' })
      .props.onPress();
  });
  expect(app.historyVisible).toBe(true);
  await Renderer.act(async () => renderer!.unmount());
  menu.mockRestore();
});

test.each(['android', 'ios'] as const)(
  '%s offers vision setup when attaching without a loaded vision model',
  async platform => {
    let renderer: Renderer.ReactTestRenderer;
    let select = () => {};
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((_options, callback) => {
        select = () => callback(1);
      });
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _message, buttons) => {
        select = () =>
          buttons?.find(button => button.text === 'Camera')?.onPress?.();
      });
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
    expect(app.visionSetupVisible).toBe(false);
    await Renderer.act(async () => {
      select();
    });
    expect(app.visionSetupVisible).toBe(true);
    expect(app.route).toBe('chat');
    await Renderer.act(async () => renderer!.unmount());
    sheet.mockRestore();
    alert.mockRestore();
  },
);

test.each(['android', 'ios'] as const)(
  '%s groups Settings and opens the library without attaching files',
  async platform => {
    let renderer: Renderer.ReactTestRenderer;
    let selection = 'Documents';
    const menu = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((options, callback) =>
        callback(options.options.indexOf(selection)),
      );
    await Renderer.act(async () => {
      renderer = Renderer.create(<Harness platform={platform} />);
    });
    await Renderer.act(async () => {
      renderer!.root
        .findByProps({ accessibilityLabel: 'Open navigation menu' })
        .props.onPress();
    });
    if (platform === 'android') {
      expect(
        renderer!.root.findAllByProps({ accessibilityLabel: 'Import chat' }),
      ).toHaveLength(0);
      await Renderer.act(async () => {
        renderer!.root
          .findByProps({ accessibilityLabel: 'Documents' })
          .props.onPress();
      });
    }
    expect(app.route).toBe('documents');
    const library = renderer!.root
      .findAllByType(DocumentLibraryView)
      .find(node => node.props.onToggle === undefined);
    expect(library).toBeDefined();
    expect(library!.props.selected).toBeUndefined();
    expect(app.chat.documentIds).toEqual([]);
    await Renderer.act(async () => {
      app.setRoute('chat');
      app.setDocumentsVisible(true);
    });
    expect(renderer!.root.findByType(DocumentLibraryView).props.onToggle).toBe(
      app.chat.toggleDocument,
    );
    await Renderer.act(async () => {
      app.setDocumentsVisible(false);
      selection = 'Nearby sharing';
      renderer!.root
        .findByProps({ accessibilityLabel: 'Open navigation menu' })
        .props.onPress();
    });
    if (platform === 'android')
      await Renderer.act(async () => {
        renderer!.root
          .findByProps({ accessibilityLabel: 'Nearby sharing' })
          .props.onPress();
      });
    expect(app.route).toBe('nearby');
    expect(renderer!.root.findByProps({ label: 'Send model' })).toBeDefined();
    expect(
      renderer!.root.findByProps({ label: 'Receive model' }),
    ).toBeDefined();
    await Renderer.act(async () => {
      app.setRoute('settings');
    });
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Import chat' }),
    ).toBeDefined();
    const sectionTab = (label: string) =>
      renderer!.root
        .findAllByProps({ accessibilityRole: 'tab' })
        .find(node => node.props.accessibilityLabel === label)!;
    expect(sectionTab('General').props.accessibilityState.selected).toBe(true);
    expect(
      renderer!.root.findAllByProps({ label: 'Model settings' }),
    ).toHaveLength(0);
    await Renderer.act(async () =>
      sectionTab('Model defaults').props.onPress(),
    );
    expect(sectionTab('Model defaults').props.accessibilityState.selected).toBe(
      true,
    );
    expect(
      renderer!.root.findByProps({ label: 'Model settings' }),
    ).toBeDefined();
    expect(
      renderer!.root.findAllByProps({ accessibilityLabel: 'Import chat' }),
    ).toHaveLength(0);
    await Renderer.act(async () => sectionTab('About app').props.onPress());
    expect(
      renderer!.root
        .findAllByType('Text' as never)
        .map(node => node.props.children),
    ).toContain('Engine diagnostics');
    expect(
      renderer!.root.findAllByProps({ label: 'Model settings' }),
    ).toHaveLength(0);
    await Renderer.act(async () =>
      sectionTab('Host & Connect').props.onPress(),
    );
    expect(sectionTab('Host & Connect').props.accessibilityState.selected).toBe(
      true,
    );
    expect(
      renderer!.root
        .findAllByType('Text' as never)
        .map(node => node.props.children),
    ).not.toContain('Engine diagnostics');
    await Renderer.act(async () => sectionTab('General').props.onPress());
    expect(
      renderer!.root.findByProps({ accessibilityLabel: 'Import chat' }),
    ).toBeDefined();
    await Renderer.act(async () => {
      renderer!.root
        .findAll(node => typeof node.props.onTokenSettings === 'function')[0]
        .props.onTokenSettings();
    });
    expect(app.settingsSection).toBe('Model defaults');
    expect(sectionTab('Model defaults').props.accessibilityState.selected).toBe(
      true,
    );
    await Renderer.act(async () => renderer!.unmount());
    menu.mockRestore();
  },
);

test('Android export saves the current canonical chat; Settings import opens a new conversation', async () => {
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
    app.setRoute('settings');
  });
  await Renderer.act(async () => {
    await renderer!.root
      .findByProps({ accessibilityLabel: 'Import chat' })
      .props.onPress();
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
      options: ['Cancel', 'Export chat', 'Ask your documents'],
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

test.each(['android', 'ios'] as const)(
  '%s opens report form and saves/submits only on request',
  async platform => {
    const submitting = submitIssueReport as jest.Mock;
    submitting.mockClear();
    const menu = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation((options, callback) =>
        callback(options.options.indexOf('Report an issue')),
      );
    let renderer: Renderer.ReactTestRenderer;
    await Renderer.act(async () => {
      renderer = Renderer.create(<Harness platform={platform} />);
    });
    await Renderer.act(async () => {
      renderer!.root
        .findByProps({ accessibilityLabel: 'Open navigation menu' })
        .props.onPress();
    });
    if (platform === 'android')
      await Renderer.act(async () => {
        renderer!.root
          .findAllByProps({ accessibilityLabel: 'Report an issue' })
          .find(node => typeof node.props.onPress === 'function')!
          .props.onPress();
      });
    expect(app.issueReportVisible).toBe(true);
    expect(submitting).not.toHaveBeenCalled();
    await Renderer.act(async () => {
      const fields = renderer!.root.findAllByType(TextInput);
      fields
        .find(node => node.props.accessibilityLabel === 'Issue title')!
        .props.onChangeText('Generation failed');
      fields
        .find(node => node.props.accessibilityLabel === 'Issue description')!
        .props.onChangeText('Stopped after the first word.');
    });
    await Renderer.act(async () => {
      await renderer!.root.findByProps({ label: 'Save draft' }).props.onPress();
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      '@llmhub/issue-report-draft-v1',
      expect.stringContaining('Generation failed'),
    );
    expect(submitting).not.toHaveBeenCalled();
    submitting.mockRejectedValueOnce(
      new Error('Network unavailable; draft kept.'),
    );
    await Renderer.act(async () => {
      await renderer!.root
        .findByProps({ label: 'Submit report' })
        .props.onPress();
    });
    expect(
      renderer!.root
        .findAllByType(TextInput)
        .find(node => node.props.accessibilityLabel === 'Issue title')!.props
        .value,
    ).toBe('Generation failed');
    await Renderer.act(async () => {
      await renderer!.root
        .findByProps({ label: 'Submit report' })
        .props.onPress();
    });
    expect(submitting).toHaveBeenCalledTimes(2);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
      '@llmhub/issue-report-draft-v1',
    );
    expect(
      renderer!.root
        .findAllByType(TextInput)
        .find(node => node.props.accessibilityLabel === 'Issue title')!.props
        .value,
    ).toBe('');
    const report = submitting.mock.calls[0][0];
    expect(report.title).toBe('Generation failed');
    expect(report.diagnostics).toBeUndefined();
    await Renderer.act(async () => renderer!.unmount());
    menu.mockRestore();
  },
);
