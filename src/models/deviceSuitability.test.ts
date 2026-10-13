import {
  estimateSuitability,
  fileSizeFit,
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

test('quick size filter accepts the 80% boundary and rejects larger combined files', () => {
  const budget = {
    totalBytes: 8000,
    availableBytes: 6000,
    appBudgetBytes: 5000,
  };
  expect(fileSizeFit(4000, budget)).toBe('fits');
  expect(fileSizeFit(4001, budget)).toBe('large');
  expect(fileSizeFit(3000, budget, 1000)).toBe('fits');
  expect(fileSizeFit(3000, budget, 1001)).toBe('large');
  expect(fileSizeFit(0, budget)).toBe('unknown');
  expect(fileSizeFit(1000, null)).toBe('unknown');
  expect(fileSizeFit(1000, { ...budget, appBudgetBytes: 0 })).toBe('unknown');
});
