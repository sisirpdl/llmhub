import { hfAuthHeaders, downloadHttpError } from './hfAuth';
test('adds a trimmed bearer token only for the HTTPS Hub origin', () => {
  expect(
    hfAuthHeaders(
      'https://huggingface.co/org/model/resolve/main/model.gguf',
      ' hf_read ',
    ),
  ).toEqual({ Authorization: 'Bearer hf_read' });
  expect(hfAuthHeaders('https://huggingface.co/model', '')).toBeUndefined();
  for (const url of [
    'https://example.com/model',
    'https://huggingface.co.attacker.com/model',
    'https://huggingface.co@attacker.com/model',
    'http://huggingface.co/model',
  ])
    expect(hfAuthHeaders(url, 'hf_read')).toBeUndefined();
});
test('authentication failures point to Settings without including credentials', () => {
  expect(downloadHttpError(401)).toContain('Settings');
  expect(downloadHttpError(403)).toContain('access to this model');
  expect(downloadHttpError(500)).toBe('Download failed with HTTP 500.');
});
