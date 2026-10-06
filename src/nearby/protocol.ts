import type { ModelManifest } from '../models/modelCatalog';
import type { VisionManifest } from '../models/visionCatalog';
export const CHUNK_BYTES = 256 * 1024;
export const PORT = 8081;
export type Artifact = { name: string; size: number; sha256: string };
export type Offer = {
  version: 1;
  id: string;
  name: string;
  license: string;
  contextLength: number;
  artifacts: Artifact[];
};
export const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{48}(?:-\d{1,12})?$/.test(value);
export function parseOffer(value: unknown): Offer {
  const offer = value as Offer;
  if (
    !offer ||
    offer.version !== 1 ||
    !identifier(offer.id) ||
    !text(offer.name) ||
    !text(offer.license) ||
    !Number.isInteger(offer.contextLength) ||
    offer.contextLength < 128 ||
    offer.contextLength > 131072 ||
    !Array.isArray(offer.artifacts) ||
    ![1, 2].includes(offer.artifacts.length) ||
    !offer.artifacts.every(
      a =>
        a &&
        text(a.name) &&
        a.name.toLowerCase().endsWith('.gguf') &&
        Number.isSafeInteger(a.size) &&
        a.size >= 8 &&
        a.size <= 64 * 1024 ** 3 &&
        typeof a.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(a.sha256),
    )
  ) {
    throw new Error('The sender offered invalid or unsupported model files.');
  }
  return {
    version: 1,
    id: offer.id,
    name: offer.name,
    license: offer.license,
    contextLength: offer.contextLength,
    artifacts: offer.artifacts.map(a => ({
      name: a.name,
      size: a.size,
      sha256: a.sha256,
    })),
  };
}
function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    // eslint-disable-next-line no-control-regex
    !/[\x00-\x1f\x7f]/.test(value)
  );
}
export const totalBytes = (offer: Offer) =>
  offer.artifacts.reduce((sum, a) => sum + a.size, 0);
// Names and sender IDs are deliberately excluded: resume only identical bytes and bundle order.
export const fingerprint = (offer: Offer) =>
  offer.artifacts.map(a => `${a.size}:${a.sha256}`).join('|');
export const controlAAD = (direction: 'request' | 'response', id: string) =>
  `llmhub-transfer-v1:${direction}:${id}`;
export const chunkAAD = (
  offer: string,
  artifact: number,
  offset: number,
  length: number,
  request: string,
) =>
  `llmhub-transfer-v1:chunk:${offer}:${artifact}:${offset}:${length}:${request}`;
export function checkChunk(
  offer: Offer,
  artifact: number,
  offset: number,
  length: number,
) {
  const file = offer.artifacts[artifact];
  if (
    !Number.isInteger(artifact) ||
    !file ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset % CHUNK_BYTES !== 0 ||
    !Number.isInteger(length) ||
    length !== Math.min(CHUNK_BYTES, file.size - offset) ||
    length <= 0
  )
    throw new Error('Invalid chunk range.');
}
export function catalogMatch(
  offer: Offer,
  catalog: ModelManifest[],
): ModelManifest | undefined {
  return catalog.find(model => {
    const artifacts = [
      { size: model.byteSize, sha256: model.sha256 },
      ...('kind' in model && model.kind === 'vision'
        ? [
            {
              size: (model as VisionManifest).projectorByteSize,
              sha256: (model as VisionManifest).projectorSha256,
            },
          ]
        : []),
    ];
    return (
      fingerprint(offer) ===
      artifacts.map(a => `${a.size}:${a.sha256}`).join('|')
    );
  });
}
