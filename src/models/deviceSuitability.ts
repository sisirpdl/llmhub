import type { DeviceMemory } from '../device/memory';
export type MemoryMetadata = {
  architecture: string;
  layers: number;
  kvHeads: number;
  keyLength: number;
  valueLength: number;
  maxContext: number;
};
export type Suitability = {
  status: 'fits' | 'tight' | 'large' | 'unknown';
  estimatedBytes: number | null;
};
export const STORAGE_MARGIN = 256 * 1024 ** 2;
export function memoryMetadata(
  data: Record<string, unknown>,
): MemoryMetadata | null {
  const architecture = String(data['general.architecture'] || '');
  const n = (key: string) => Number(data[`${architecture}.${key}`]);
  const heads = n('attention.head_count');
  const embedding = n('embedding_length');
  const result = {
    architecture,
    layers: n('block_count'),
    kvHeads: n('attention.head_count_kv') || heads,
    keyLength: n('attention.key_length') || embedding / heads,
    valueLength: n('attention.value_length') || embedding / heads,
    maxContext: n('context_length'),
  };
  // State-space/MLA models need different cache calculations; leave those unknown.
  if (
    ![
      'llama',
      'qwen2',
      'qwen3',
      'gemma',
      'gemma2',
      'gemma3',
      'phi2',
      'phi3',
      'mistral',
      'starcoder2',
      'internlm2',
      'olmo',
      'olmo2',
    ].includes(architecture)
  )
    return null;
  if (
    ![
      result.layers,
      result.kvHeads,
      result.keyLength,
      result.valueLength,
      result.maxContext,
    ].every(v => Number.isFinite(v) && v > 0 && v < 1_000_000)
  )
    return null;
  return result;
}
export function estimateSuitability(
  size: number,
  metadata: MemoryMetadata | null,
  memory: DeviceMemory | null,
  contextLength: number,
  projectorSize = 0,
  vision = false,
): Suitability {
  if (
    !metadata ||
    !memory ||
    size <= 0 ||
    memory.appBudgetBytes <= 0 ||
    contextLength > metadata.maxContext
  )
    return { status: 'unknown', estimatedBytes: null };
  const cache =
    metadata.layers *
    metadata.kvHeads *
    (metadata.keyLength + metadata.valueLength) *
    contextLength *
    2;
  const buffers =
    Math.max(384 * 1024 ** 2, size * 0.12) + (vision ? 384 * 1024 ** 2 : 0);
  const estimatedBytes = Math.ceil(
    (size + cache + buffers + projectorSize * 1.15) * 1.1,
  );
  return {
    status:
      estimatedBytes <= memory.appBudgetBytes * 0.85
        ? 'fits'
        : estimatedBytes <= memory.appBudgetBytes
        ? 'tight'
        : 'large',
    estimatedBytes,
  };
}
export const storageShortfall = (
  size: number,
  projectorSize: number,
  free: number | null,
) =>
  free === null
    ? null
    : Math.max(0, size + projectorSize + STORAGE_MARGIN - free);

// Browsing heuristic only: this does not estimate context cache or engine compatibility.
export const MODEL_FILE_BUDGET_FRACTION = 0.8;
export function fileSizeFit(
  size: number,
  memory: DeviceMemory | null,
  projectorSize = 0,
): 'fits' | 'large' | 'unknown' {
  if (
    !memory ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(projectorSize) ||
    projectorSize < 0 ||
    !Number.isFinite(memory.appBudgetBytes) ||
    memory.appBudgetBytes <= 0
  )
    return 'unknown';
  return size + projectorSize <=
    memory.appBudgetBytes * MODEL_FILE_BUDGET_FRACTION
    ? 'fits'
    : 'large';
}
