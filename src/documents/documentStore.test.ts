jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/private',
    mkdir: jest.fn(),
    stat: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    moveFile: jest.fn(),
    exists: jest.fn(),
    unlink: jest.fn(),
  },
}));
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { fs: { hash: jest.fn() } },
}));
jest.mock('@react-native-documents/picker', () => ({
  keepLocalCopy: jest.fn(),
  pick: jest.fn(),
  types: { allFiles: '*/*' },
  isErrorWithCode: () => false,
  errorCodes: {},
}));
jest.mock('./pdfText', () => ({
  ...jest.requireActual('./pdfText'),
  extractPdf: jest.fn(),
}));
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import { keepLocalCopy, pick } from '@react-native-documents/picker';
import { extractPdf, type ImportControl } from './pdfText';
import {
  importTextDocument,
  loadDocumentChunks,
  deleteDocument,
  pickTextDocument,
} from './documentStore';
const hash = 'a'.repeat(64);
const picked = { uri: 'content://book', name: 'Biology.pdf', size: 1000 };
beforeEach(() => {
  jest.resetAllMocks();
  (RNFS.unlink as jest.Mock).mockResolvedValue(undefined);
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: 1000 });
  (RNFS.exists as jest.Mock).mockResolvedValue(true);
  (RNBlobUtil.fs.hash as jest.Mock).mockResolvedValue(hash);
  (keepLocalCopy as jest.Mock).mockResolvedValue([
    { status: 'success', localUri: 'file:///cache/book.pdf' },
  ]);
  (extractPdf as jest.Mock).mockResolvedValue([
    { page: 1, text: '' },
    { page: 2, text: 'Photosynthesis uses sunlight.' },
  ]);
});
test('PDF import saves an owned original and cached page-aware index', async () => {
  const document = await importTextDocument(picked);
  expect(document).toMatchObject({
    kind: 'pdf',
    pageCount: 2,
    emptyPages: 1,
    contentHash: hash,
  });
  expect(document.path).toMatch(/^\/private\/documents\/document-.*\.pdf$/);
  expect(RNFS.moveFile).toHaveBeenCalledWith('/cache/book.pdf', document.path);
  expect(extractPdf).toHaveBeenCalledWith(document.path, undefined);
  const cache = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
  expect(cache.chunks[0]).toMatchObject({
    page: 2,
    documentName: 'Biology.pdf',
  });
  expect(
    JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]),
  ).toEqual([document]);
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(cache));
  (extractPdf as jest.Mock).mockClear();
  expect(await loadDocumentChunks([document])).toEqual(cache.chunks);
  expect(extractPdf).not.toHaveBeenCalled();
});
test('failed extraction removes copies and index without recording a document', async () => {
  (extractPdf as jest.Mock).mockRejectedValue(new Error('PDF is corrupt'));
  await expect(importTextDocument(picked)).rejects.toThrow('corrupt');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(RNFS.unlink).toHaveBeenCalledWith('/cache/book.pdf');
  expect(
    (RNFS.unlink as jest.Mock).mock.calls
      .map(call => call[0])
      .some(path => path.endsWith('.index.json')),
  ).toBe(true);
});
test('cancellation after copying cleans up without parsing', async () => {
  const control: ImportControl = { cancelled: false };
  (keepLocalCopy as jest.Mock).mockImplementation(async () => {
    control.cancelled = true;
    return [{ status: 'success', localUri: 'file:///cache/book.pdf' }];
  });
  await expect(importTextDocument(picked, control)).rejects.toThrow(
    'cancelled',
  );
  expect(extractPdf).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(RNFS.unlink).toHaveBeenCalledWith('/cache/book.pdf');
});
test('actual copied size is checked even when the picker size is unknown', async () => {
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: 51 * 1024 * 1024 });
  await expect(importTextDocument({ ...picked, size: null })).rejects.toThrow(
    '50 MB',
  );
  expect(extractPdf).not.toHaveBeenCalled();
});
test('the picker accepts PDFs and rejects unsupported files', async () => {
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://book', name: 'Biology.PDF', size: 1000 },
  ]);
  expect(await pickTextDocument()).toMatchObject({ name: 'Biology.PDF' });
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://book', name: 'archive.zip' },
  ]);
  await expect(pickTextDocument()).rejects.toThrow('Choose a local PDF');
});
test('legacy text files gain a cached index without using the PDF parser', async () => {
  const document = {
    id: 'document-legacy',
    name: 'Notes.md',
    path: '/private/documents/notes.md',
    contentHash: hash,
    size: 100,
    importedAt: 1,
  };
  (RNFS.exists as jest.Mock).mockImplementation(
    async path => !path.endsWith('.index.json'),
  );
  (RNFS.readFile as jest.Mock).mockResolvedValue('# Notes\n\nPrivate notes.');
  expect((await loadDocumentChunks([document]))[1].text).toBe('Private notes.');
  expect(extractPdf).not.toHaveBeenCalled();
  expect(RNFS.writeFile).toHaveBeenCalledTimes(1);
});
test('missing PDF indexes require reimport rather than reading binary data as text', async () => {
  const document = {
    id: 'document-pdf',
    name: 'Book.pdf',
    path: '/private/documents/book.pdf',
    contentHash: hash,
    size: 100,
    importedAt: 1,
  };
  (RNFS.exists as jest.Mock).mockImplementation(
    async path => !path.endsWith('.index.json'),
  );
  await expect(loadDocumentChunks([document])).rejects.toThrow('missing');
  expect(RNFS.readFile).not.toHaveBeenCalled();
});
test('deletion removes metadata, original, and cached index', async () => {
  const document = {
    id: 'document-pdf',
    name: 'Book.pdf',
    path: '/private/documents/book.pdf',
    contentHash: hash,
    size: 100,
    importedAt: 1,
  };
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
    JSON.stringify([document]),
  );
  await deleteDocument(document);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    '@llmhub/documents-v1',
    '[]',
  );
  expect(RNFS.unlink).toHaveBeenCalledWith(document.path);
  expect(RNFS.unlink).toHaveBeenCalledWith(
    '/private/documents/document-pdf.index.json',
  );
});
