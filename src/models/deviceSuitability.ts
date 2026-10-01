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
