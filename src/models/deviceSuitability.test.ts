import {
  estimateSuitability,
  memoryMetadata,
  storageShortfall,
} from './deviceSuitability';
const metadata = memoryMetadata({
  'general.architecture': 'qwen2',
  'qwen2.block_count': 24,
  'qwen2.attention.head_count': 16,
  'qwen2.attention.head_count_kv': 2,
  'qwen2.embedding_length': 1024,
  'qwen2.context_length': 32768,
})!;
const memory = {
  totalBytes: 8 * 1024 ** 3,
  availableBytes: 6 * 1024 ** 3,
  appBudgetBytes: 5 * 1024 ** 3,
};
test('estimates weights, KV cache and buffers rather than equating RAM with file size', () => {
  const value = estimateSuitability(1024 ** 3, metadata, memory, 2048);
  expect(value.status).toBe('fits');
  expect(value.estimatedBytes).toBeGreaterThan(1024 ** 3);
  expect(
    estimateSuitability(6 * 1024 ** 3, metadata, memory, 2048).status,
  ).toBe('large');
});
test('increasing context and adding vision increase estimated RAM', () => {
  const base = estimateSuitability(1024 ** 3, metadata, memory, 2048)
    .estimatedBytes!;
  expect(
    estimateSuitability(1024 ** 3, metadata, memory, 8192).estimatedBytes,
  ).toBeGreaterThan(base);
  expect(
    estimateSuitability(
      1024 ** 3,
      metadata,
      memory,
      2048,
      500 * 1024 ** 2,
      true,
    ).estimatedBytes,
  ).toBeGreaterThan(base);
});
test('keeps unrecognized architectures and missing device data unknown', () => {
  expect(memoryMetadata({ 'general.architecture': 'mamba' })).toBeNull();
  expect(estimateSuitability(1000, null, memory, 2048).status).toBe('unknown');
  expect(estimateSuitability(1000, metadata, null, 2048).status).toBe(
    'unknown',
  );
  expect(estimateSuitability(1000, metadata, memory, 65536).status).toBe(
    'unknown',
  );
});
test('storage shortfall is independent from RAM suitability and includes projector/headroom', () => {
  expect(estimateSuitability(1024 ** 3, metadata, memory, 2048).status).toBe(
    'fits',
  );
  expect(storageShortfall(1024 ** 3, 512 * 1024 ** 2, 1024 ** 3)).toBe(
    768 * 1024 ** 2,
  );
  expect(storageShortfall(1000, 0, null)).toBeNull();
});
