jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    CachesDirectoryPath: '/cache',
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn(),
    stat: jest.fn().mockResolvedValue({ size: 100 }),
    unlink: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue(true),
  },
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  saveDocuments: jest.fn(),
  isErrorWithCode: (e: { code?: string }) => !!e?.code,
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));
import RNFS from 'react-native-fs';
import {
  pick,
  keepLocalCopy,
  saveDocuments,
} from '@react-native-documents/picker';
import { exportChat, importChatFile } from './chatTransfer';
import { parseChat, MAX_CHAT_BYTES, type ChatDocument } from './chatDocument';
const document: ChatDocument = {
  model: 'qwen3-4b-q4_k_m',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain photosynthesis' },
    { role: 'assistant', content: 'Photosynthesis is…' },
  ],
};
beforeEach(() => {
  jest.clearAllMocks();
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://picked', name: 'chat.json', size: 100 },
  ]);
  (keepLocalCopy as jest.Mock).mockResolvedValue([
    { status: 'success', localUri: 'file:///cache/import.json' },
  ]);
  (saveDocuments as jest.Mock).mockResolvedValue([
    { uri: 'content://saved', error: null },
  ]);
  (RNFS.stat as jest.Mock).mockResolvedValue({ size: 100 });
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(document));
  (RNFS.writeFile as jest.Mock).mockResolvedValue(undefined);
});
test('imports the exact OpenAI shape without identifiers or app fields in messages', async () => {
  const result = await importChatFile();
  expect(result!.document).toEqual(document);
  expect(result!.images).toEqual([]);
  expect(RNFS.unlink).toHaveBeenCalledWith('/cache/import.json');
});
test('exports a single JSON document with no app metadata and cleans staging', async () => {
  expect(await exportChat(document, 'Plant lesson')).toBe(true);
  expect(JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1])).toEqual(
    document,
  );
  expect(saveDocuments).toHaveBeenCalledWith(
    expect.objectContaining({
      mimeType: 'application/json',
      fileName: 'Plant-lesson.json',
      copy: true,
    }),
  );
  expect(RNFS.unlink).toHaveBeenCalledWith(
    expect.stringContaining('/cache/chat-exports/'),
  );
});
test('embeds private images for portable export without modifying stored messages', async () => {
  const doc: ChatDocument = {
    model: 'vision',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Photo' },
          {
            type: 'image_url',
            image_url: {
              url: 'file:///docs/chat-images/photo.jpg',
              detail: 'low',
            },
          },
        ],
      },
    ],
  };
  (RNFS.readFile as jest.Mock).mockResolvedValue('YWJj');
  await exportChat(doc, 'Photo');
  const output = JSON.parse((RNFS.writeFile as jest.Mock).mock.calls[0][1]);
  expect(output.messages[0].content[1].image_url).toEqual({
    url: 'data:image/jpeg;base64,YWJj',
    detail: 'low',
  });
  expect(JSON.stringify(doc)).toContain('file:///docs/chat-images/photo.jpg');
});
test('imports inline images into private storage and preserves typed content', async () => {
  const doc = {
    model: 'vision',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,YWJj' },
          },
        ],
      },
    ],
  };
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(doc));
  const result = await importChatFile();
  expect(result!.images).toHaveLength(1);
  expect(JSON.stringify(result!.document)).toContain(
    'file:///docs/chat-images/',
  );
  expect(RNFS.writeFile).toHaveBeenCalledWith(
    expect.stringMatching(/\.png$/),
    'YWJj',
    'base64',
  );
});
test('preserves tool history and nullable assistant content', async () => {
  const doc = {
    model: 'tool-model',
    messages: [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":"plants"}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call1',
        content: 'Result',
        name: 'lookup',
      },
    ],
  };
  (RNFS.readFile as jest.Mock).mockResolvedValue(JSON.stringify(doc));
  expect((await importChatFile())!.document).toEqual(doc);
});
test.each([
  'file:///etc/passwd',
  'content://secret',
  'file:///docs/chat-images/%2e%2e%2fsecret.jpg',
])('rejects imported local references: %s', async url => {
  (RNFS.readFile as jest.Mock).mockResolvedValue(
    JSON.stringify({
      model: 'vision',
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url } }] },
      ],
    }),
  );
  await expect(importChatFile()).rejects.toThrow(
    'Local file paths cannot be imported',
  );
  expect(RNFS.writeFile).not.toHaveBeenCalled();
});
test('does not read an encoded path traversal during export', async () => {
  await expect(
    exportChat(
      {
        model: 'vision',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'file:///docs/chat-images/%2e%2e%2fsecret.jpg',
                },
              },
            ],
          },
        ],
      },
      'chat',
    ),
  ).rejects.toThrow('outside chat storage');
  expect(RNFS.readFile).not.toHaveBeenCalled();
});
test('removes newly created images after a failed import', async () => {
  (RNFS.readFile as jest.Mock).mockResolvedValue(
    JSON.stringify({
      model: 'vision',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,YWJj' },
            },
          ],
        },
      ],
    }),
  );
  (RNFS.writeFile as jest.Mock).mockRejectedValueOnce(new Error('Disk full'));
  await expect(importChatFile()).rejects.toThrow('Disk full');
  expect(RNFS.unlink).toHaveBeenCalledWith(
    expect.stringContaining('/docs/chat-images/'),
  );
});
test('rejects malformed roles/content and oversized files without importing', async () => {
  expect(() => parseChat('{bad')).toThrow('valid JSON');
  expect(() =>
    parseChat(
      JSON.stringify({
        model: 'x',
        messages: [{ role: 'intruder', content: 'x' }],
      }),
    ),
  ).toThrow('role');
  expect(() =>
    parseChat(
      JSON.stringify({
        model: 'x',
        messages: [{ role: 'tool', content: 'x' }],
      }),
    ),
  ).toThrow('tool_call_id');
  (pick as jest.Mock).mockResolvedValue([
    { uri: 'content://huge', size: MAX_CHAT_BYTES + 1 },
  ]);
  await expect(importChatFile()).rejects.toThrow('32 MiB');
  expect(keepLocalCopy).not.toHaveBeenCalled();
});
test('picker cancellation is a no-op; save errors clean the temporary export', async () => {
  (pick as jest.Mock).mockRejectedValueOnce({ code: 'OPERATION_CANCELED' });
  expect(await importChatFile()).toBeNull();
  (saveDocuments as jest.Mock).mockRejectedValueOnce({
    code: 'OPERATION_CANCELED',
  });
  expect(await exportChat(document, 'chat')).toBe(false);
  (saveDocuments as jest.Mock).mockResolvedValueOnce([
    { error: 'write failed' },
  ]);
  await expect(exportChat(document, 'chat')).rejects.toThrow(
    'could not be saved',
  );
  expect(RNFS.unlink).toHaveBeenCalled();
});
