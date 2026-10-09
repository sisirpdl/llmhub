import { decodePairing, encodePairing } from './pairing';
const address = 'http://192.168.1.10:8081',
  key = 'a'.repeat(48);
test('round trips private pairing credentials without losing characters', () => {
  const value = encodePairing(address, key);
  expect(decodePairing(value)).toEqual({ address, key });
  expect(value).toContain('llmhub://nearby/v1?');
});
test('rejects unrelated codes, unsupported versions and ambiguous parameters', () => {
  const valid = encodePairing(address, key);
  for (const value of [
    '',
    null,
    'https://example.com',
    valid.replace('/v1?', '/v2?'),
    valid + '&key=' + key,
    valid + '&extra=1',
    valid.replace('address=', 'unknown='),
    valid.replace(key, key.toUpperCase()),
    valid.replace(key, 'a'.repeat(47)),
    valid + '#fragment',
    valid.replace(
      'http%3A%2F%2F192.168.1.10%3A8081',
      'http%3A%2F%2F8.8.8.8%3A8081',
    ),
    'x'.repeat(513),
  ])
    expect(() => decodePairing(value)).toThrow('not an LLMHub');
});
test('rejects credentials, paths, public hosts and malformed encodings', () => {
  for (const target of [
    'http://192.168.1.10:8081/path',
    'https://192.168.1.10:8081',
    'http://user@192.168.1.10:8081',
    'http://localhost:8081',
    'http://192.168.1.999:8081',
    'http://192.168.1.10:80',
    'http://127.0.0.1:8081',
  ])
    expect(() =>
      decodePairing(
        `llmhub://nearby/v1?address=${encodeURIComponent(target)}&key=${key}`,
      ),
    ).toThrow();
  expect(() =>
    decodePairing(`llmhub://nearby/v1?address=%ZZ&key=${key}`),
  ).toThrow();
});
