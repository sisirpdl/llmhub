import { prepareMessages } from './promptBuilder';
import type { ChatMessage } from './chatDocument';
const prepare = (messages: ChatMessage[], vision = false, context = 2048) =>
  prepareMessages(messages, context, 256, vision);
test('keeps native message objects and system instructions intact', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Be concise.' },
    { role: 'user', content: 'Hi <tags>' },
    { role: 'assistant', content: 'Hello' },
  ];
  expect(prepare(messages).messages).toEqual(messages);
  expect(prepare(messages).messages[1]).toBe(messages[1]);
});
test('keeps multiple system/developer messages instead of replacing them', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'A' },
    { role: 'developer', content: 'B' },
    { role: 'user', content: 'C' },
  ];
  expect(prepare(messages).messages).toEqual(messages);
});
test('omits complete older turns without orphaning tool results', () => {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'Rules' },
    { role: 'user', content: 'old '.repeat(1000) },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', content: 'Result', tool_call_id: 'call' },
    { role: 'assistant', content: 'Old answer' },
    { role: 'user', content: 'Latest' },
  ];
  const result = prepare(messages, false, 512);
  expect(result.messages).toEqual([messages[0], messages[5]]);
  expect(result.omittedMessageCount).toBe(4);
});
test('preserves a full newest turn and reports oversize instead of silently truncating', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'large '.repeat(1000) },
  ];
  expect(prepare(messages, false, 512).messages).toEqual(messages);
  expect(prepare(messages, false, 512).oversized).toBe(true);
});
test('vision uses typed parts natively; text capability filtering keeps typed text', () => {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Image?' },
        { type: 'image_url', image_url: { url: 'file:///private/image.jpg' } },
      ],
    },
  ];
  expect(prepare(messages, true).messages[0]).toBe(messages[0]);
  expect(prepare(messages).messages[0].content).toEqual([
    { type: 'text', text: 'Image?' },
  ]);
  expect(messages[0].content).toHaveLength(2);
});
test('does not fetch remote media or pretend unsupported media is text', () => {
  expect(() =>
    prepare(
      [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/private.png' },
            },
          ],
        },
      ],
      true,
    ),
  ).toThrow('will not fetch');
  expect(() =>
    prepare([
      {
        role: 'user',
        content: [
          { type: 'input_audio', input_audio: { data: 'YWJj', format: 'wav' } },
        ],
      },
    ]),
  ).toThrow('does not support');
});

test('preserves instruction placement and complete tool history in native order', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Lookup' },
    { role: 'system', content: 'Updated instruction' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'a',
          type: 'function',
          function: { name: 'lookup', arguments: '{}' },
        },
      ],
    },
    { role: 'tool', tool_call_id: 'a', content: 'Found it' },
    { role: 'assistant', content: 'Answer' },
  ];
  expect(prepare(messages).messages).toEqual(messages);
});
