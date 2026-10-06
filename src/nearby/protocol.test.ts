import {
  catalogMatch,
  CHUNK_BYTES,
  checkChunk,
  chunkAAD,
  controlAAD,
  fingerprint,
  parseOffer,
} from './protocol';
const offer = {
  version: 1 as const,
  id: 'a'.repeat(48),
  name: 'Test',
  license: 'Apache-2.0',
  contextLength: 2048,
  artifacts: [
    { name: 'model.gguf', size: CHUNK_BYTES + 8, sha256: 'b'.repeat(64) },
  ],
};
test('validates single files and vision bundles, rejecting unsafe payloads', () => {
  expect(parseOffer(offer)).toEqual(offer);
  expect(
    parseOffer({
      ...offer,
      artifacts: [
        ...offer.artifacts,
        { ...offer.artifacts[0], name: 'projector.gguf' },
      ],
    }).artifacts,
  ).toHaveLength(2);
  for (const change of [
    { version: 2 },
    { id: 'x' },
    { name: 'a\nheader' },
    { contextLength: 0 },
    { artifacts: [] },
    { artifacts: [{ ...offer.artifacts[0], size: Infinity }] },
    { artifacts: [{ ...offer.artifacts[0], sha256: 'x' }] },
    { artifacts: [{ ...offer.artifacts[0], name: 'model.bin' }] },
  ])
    expect(() => parseOffer({ ...offer, ...change })).toThrow();
});
test('accepts only exact bounded chunks and the final tail', () => {
  checkChunk(offer, 0, 0, CHUNK_BYTES);
  checkChunk(offer, 0, CHUNK_BYTES, 8);
  for (const args of [
    [0, 1, 8],
    [0, 0, 8],
    [0, CHUNK_BYTES, 9],
    [1, 0, 8],
    [-1, 0, 8],
    [0, CHUNK_BYTES + 8, 0],
  ])
    expect(() =>
      checkChunk(offer, ...(args as [number, number, number])),
    ).toThrow();
});
test('resume requires identical hashes, sizes and artifact order', () => {
  expect(fingerprint({ ...offer, id: 'c'.repeat(48), name: 'Renamed' })).toBe(
    fingerprint(offer),
  );
  expect(
    fingerprint({
      ...offer,
      artifacts: [{ ...offer.artifacts[0], sha256: 'c'.repeat(64) }],
    }),
  ).not.toBe(fingerprint(offer));
});
test('catalog matching requires the entire bundle, not sender labels', () => {
  const model = {
    byteSize: offer.artifacts[0].size,
    sha256: offer.artifacts[0].sha256,
  } as any;
  expect(catalogMatch(offer, [model])).toBe(model);
  expect(
    catalogMatch(
      { ...offer, artifacts: [...offer.artifacts, offer.artifacts[0]] },
      [model],
    ),
  ).toBeUndefined();
});
test('authenticated context binds direction, request, model, artifact and position', () => {
  expect(controlAAD('request', 'id')).not.toBe(controlAAD('response', 'id'));
  expect(chunkAAD(offer.id, 0, 0, 8, 'id')).not.toBe(
    chunkAAD(offer.id, 0, 8, 8, 'id'),
  );
});
