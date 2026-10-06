import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { LanSettings } from './LanSettings';
import type { AppController } from '../app/AppController';
import { darkColors } from '../ui/theme';
let app: AppController;
let renderer: Renderer.ReactTestRenderer;
beforeEach(async () => {
  app = {
    colors: darkColors,
    setRoute: jest.fn(),
    chat: { sending: false },
    models: {
      context: null,
      model: { displayName: 'Qwen' },
      setExternalUIActive: jest.fn(),
      setNotice: jest.fn(),
    },
    lan: {
      host: null,
      remote: null,
      pending: false,
      activity: null,
      stopping: false,
      error: '',
      remoteStatus: 'ready',
      serving: false,
      start: jest.fn().mockResolvedValue(true),
      connect: jest.fn().mockResolvedValue(false),
      stop: jest.fn().mockResolvedValue(undefined),
      checkConnection: jest.fn(),
      clearError: jest.fn(),
      share: jest.fn(),
    },
  } as unknown as AppController;
  await act(async () => {
    renderer = Renderer.create(<LanSettings app={app} />);
  });
});
afterEach(async () => {
  await act(async () => renderer.unmount());
});
const action = (label: string) => renderer.root.findByProps({ label });
const field = (label: string) =>
  renderer.root.findByProps({ accessibilityLabel: label });
test('keeps a failed connection key and clears it on a successful retry', async () => {
  const key = 'a'.repeat(48);
  await act(async () => {
    field('LAN host address').props.onChangeText('http://192.168.1.2:8080');
    field('LAN access key').props.onChangeText(key);
  });
  expect(field('LAN access key').props.secureTextEntry).toBe(true);
  await act(async () => {
    action('Connect to host').props.onPress();
  });
  expect(field('LAN access key').props.value).toBe(key);
  (app.lan.connect as jest.Mock).mockResolvedValueOnce(true);
  await act(async () => {
    action('Connect to host').props.onPress();
  });
  expect(field('LAN access key').props.value).toBe('');
});
test('fills the two fields from shared details and clears the raw paste', async () => {
  const key = 'a'.repeat(48);
  await act(async () => {
    action('Paste shared connection details').props.onPress();
  });
  await act(async () => {
    field('Shared LAN connection details').props.onChangeText(
      `LLMHub LAN host\nhttp://192.168.1.2:8080\nAccess key: ${key}`,
    );
  });
  await act(async () => {
    action('Fill connection fields').props.onPress();
  });
  expect(field('LAN host address').props.value).toBe('http://192.168.1.2:8080');
  expect(field('LAN access key').props.value).toBe(key);
  expect(
    renderer.root.findAllByProps({
      accessibilityLabel: 'Shared LAN connection details',
    }),
  ).toHaveLength(0);
});
test('a new host session starts with its key hidden even after revealing the old key', async () => {
  app.lan.host = {
    url: 'http://192.168.1.2:8080',
    token: 'a'.repeat(48),
    session: 'one',
  };
  await act(async () => {
    renderer.update(<LanSettings app={app} />);
  });
  await act(async () => {
    action('Show access key').props.onPress();
  });
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: 'Host access key' })
      .length,
  ).toBeGreaterThan(0);
  app.lan.host = { ...app.lan.host, token: 'b'.repeat(48), session: 'two' };
  await act(async () => {
    renderer.update(<LanSettings app={app} />);
  });
  expect(
    renderer.root.findAllByProps({ accessibilityLabel: 'Host access key' }),
  ).toHaveLength(0);
});
