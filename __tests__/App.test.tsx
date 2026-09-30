/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {fs: {hash: jest.fn()}},
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/documents',
    getFSInfo: jest.fn().mockResolvedValue({freeSpace: 10_000_000_000}),
    exists: jest.fn().mockResolvedValue(false),
  },
}));
jest.mock('llama.rn', () => ({initLlama: jest.fn()}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
