import RNFS from 'react-native-fs';
import { removeChatImages, saveChatImage } from './attachments';
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    mkdir: jest.fn().mockResolvedValue(undefined),
    copyFile: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(true),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));
test('copies gallery images into private storage without deleting originals', async () => {
  const saved = await saveChatImage('file:///gallery/photo.png');
  expect(saved).toMatch(/^file:\/\/\/docs\/chat-images\/.*\.png$/);
  expect(RNFS.copyFile).toHaveBeenCalledWith(
    '/gallery/photo.png',
    saved.slice(7),
  );
  expect(RNFS.unlink).not.toHaveBeenCalled();
});
test('only removes owned attachments and deduplicates shared references', async () => {
  await removeChatImages([
    'file:///gallery/photo.png',
    'file:///docs/chat-images/owned.jpg',
    'file:///docs/chat-images/owned.jpg',
  ]);
  expect(RNFS.unlink).toHaveBeenCalledTimes(1);
  expect(RNFS.unlink).toHaveBeenCalledWith('/docs/chat-images/owned.jpg');
});
