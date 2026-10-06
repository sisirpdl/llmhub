jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));
import {
  accessKey,
  completionParameters,
  lanAddress,
  modelFromResponse,
} from './protocol';
import { defaultsFor } from '../settings/modelSettings';
import { SUPPORTED_MODELS as CATALOG } from '../models/modelCatalog';
const DEFAULT_SETTINGS = defaultsFor(CATALOG[0]);
const body = (extra = {}) =>
  JSON.stringify({
    model: 'qwen',
    messages: [
      { role: 'system', content: 'Be helpful.' },
      { role: 'user', content: 'Hello' },
    ],
    ...extra,
  });
test.each([
  'http://192.168.1.2:8080',
  'http://10.0.0.2:8080/',
  'http://172.31.1.1:65535',
])('accepts private LAN host %s', value => {
  expect(lanAddress(value)).toMatch(/^http:/);
});
test.each([
  'https://192.168.1.2:8080',
  'http://example.com:8080',
  'http://8.8.8.8:8080',
  'http://127.0.0.1:8080',
  'http://192.168.1.256:8080',
  'http://192.168.1.1:80',
  'http://192.168.1.1:65536',
  'http://192.168.1.1:8080/path',
  'http://u:p@192.168.1.1:8080',
  'http://172.32.1.1:8080',
])('rejects unsafe host %s', value => {
  expect(() => lanAddress(value)).toThrow();
});
test('validates pairing keys', () => {
  expect(accessKey('a'.repeat(48))).toHaveLength(48);
  expect(() => accessKey('hf_secret')).toThrow();
});
test('keeps native OpenAI messages and constrains sampling', () => {
  const params = completionParameters(
    body({ max_tokens: 100, temperature: 0.2 }),
    'qwen',
    DEFAULT_SETTINGS,
    2048,
  );
  expect(params.messages).toEqual(JSON.parse(body()).messages);
  expect(params).toMatchObject({ n_predict: 100, temperature: 0.2 });
});
test.each([
  { model: 'other' },
  { stream: true },
  { tools: [] },
  { max_tokens: 4096 },
  { temperature: '1' },
  { seed: 1.2 },
  { top_p: -1 },
  { messages: [] },
  {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAAA' },
          },
        ],
      },
    ],
  },
])('rejects unsupported or invalid completion %j', extra => {
  expect(() =>
    completionParameters(body(extra), 'qwen', DEFAULT_SETTINGS, 2048),
  ).toThrow();
});
test('rejects an oversized newest turn', () => {
  expect(() =>
    completionParameters(
      body({ messages: [{ role: 'user', content: 'a'.repeat(100000) }] }),
      'qwen',
      DEFAULT_SETTINGS,
      512,
    ),
  ).toThrow(/too large/);
});
test('requires a compatible host model listing', () => {
  expect(
    modelFromResponse({
      data: [{ id: 'qwen', llmhub_name: 'Qwen', context_length: 2048 }],
    }),
  ).toEqual({ id: 'qwen', name: 'Qwen', contextLength: 2048 });
  expect(() => modelFromResponse({ data: [{ id: 'qwen' }] })).toThrow();
});
test('fills pairing fields from shared details without accepting public endpoints', () => {
  const { pairingDetails } = require('./protocol');
  const key = 'a'.repeat(48);
  expect(
    pairingDetails(
      `LLMHub LAN host\nhttp://192.168.1.2:8080\nAccess key: ${key}\nKeep this key private.`,
    ),
  ).toEqual({ address: 'http://192.168.1.2:8080', key });
  expect(() =>
    pairingDetails(`http://8.8.8.8:8080\nAccess key: ${key}`),
  ).toThrow();
  expect(() => pairingDetails('http://192.168.1.2:8080')).toThrow();
});
