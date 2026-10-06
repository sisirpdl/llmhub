import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import {
  artifactPath,
  getAvailableSpace,
  metadataPath,
} from '../models/modelStore';
import {
  newImportId,
  readImportedModels,
  type ImportedModel,
} from '../models/importedModels';
import type { VisionManifest } from '../models/visionCatalog';
import type { ModelManifest } from '../models/modelCatalog';
import { SUPPORTED_MODELS } from '../models/modelCatalog';
import { SUPPORTED_VISION_MODELS } from '../models/visionCatalog';
import {
  catalogMatch,
  CHUNK_BYTES,
  fingerprint,
  parseOffer,
  totalBytes,
  type Offer,
} from './protocol';
export const incomingRoot = `${RNFS.DocumentDirectoryPath}/incoming`;
const record = `${incomingRoot}/transfer.json`;
export type Checkpoint = { version: 1; id: string; offer: Offer };
export const partialPath = (checkpoint: Checkpoint, index: number) =>
  `${incomingRoot}/${checkpoint.id}-${index}.part`;
export async function loadCheckpoint(): Promise<Checkpoint | null> {
  if (!(await RNFS.exists(record))) return null;
  const data = JSON.parse(await RNFS.readFile(record, 'utf8')) as Checkpoint;
  if (
    !data ||
    data.version !== 1 ||
    !/^import-\d+-[a-z0-9]{1,16}$/.test(data.id)
  )
    throw new Error(
      'Invalid partial transfer record. Delete the partial transfer before retrying.',
    );
  const checkpoint = {
    version: 1 as const,
    id: data.id,
    offer: parseOffer(data.offer),
  };
  // Recover an app termination between moving files and committing the catalog entry.
  if ((await readImportedModels()).some(model => model.id === data.id)) {
    await RNFS.unlink(record);
    return null;
  }
  const model = receivedModel(checkpoint);
  const names = [
    model.fileName,
    ...('kind' in model ? [model.projectorFileName] : []),
  ];
  for (const [index, name] of names.entries()) {
    const staged = artifactPath(name),
      partial = partialPath(checkpoint, index);
    if (await RNFS.exists(staged)) {
      if (await RNFS.exists(partial))
        throw new Error(
          'Conflicting partial files. Delete the partial transfer before retrying.',
        );
      await RNFS.moveFile(staged, partial);
    }
  }
  if (await RNFS.exists(metadataPath(model)))
    await RNFS.unlink(metadataPath(model));
  return checkpoint;
}
export async function offsets(checkpoint: Checkpoint): Promise<number[]> {
  const result: number[] = [];
  for (const [index, artifact] of checkpoint.offer.artifacts.entries()) {
    const path = partialPath(checkpoint, index);
    const size = (await RNFS.exists(path))
      ? Number((await RNFS.stat(path)).size)
      : 0;
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > artifact.size ||
      (size !== artifact.size && size % CHUNK_BYTES !== 0)
    )
      throw new Error(
        'A partial file was interrupted mid-chunk. Delete the partial transfer and retry.',
      );
    result.push(size);
  }
  return result;
}
export async function prepare(offer: Offer): Promise<Checkpoint> {
  await RNFS.mkdir(incomingRoot);
  const previous = await loadCheckpoint();
  if (previous && fingerprint(previous.offer) !== fingerprint(offer))
    throw new Error(
      'Another model has a partial transfer. Delete it before receiving this model.',
    );
  const checkpoint = previous
    ? { ...previous, offer }
    : { version: 1 as const, id: newImportId(), offer };
  const received = (await offsets(checkpoint)).reduce((a, b) => a + b, 0);
  if (
    (await getAvailableSpace()) <
    totalBytes(offer) - received + 256 * 1024 ** 2
  )
    throw new Error('Not enough free storage to receive this model.');
  await RNFS.writeFile(record, JSON.stringify(checkpoint), 'utf8');
  return checkpoint;
}
export async function discardPartial() {
  // Recover staged files first; a registered model is never removed here.
  await loadCheckpoint().catch(() => {});
  // Remove only files owned by this feature, including orphaned files after an interrupted commit.
  await RNFS.mkdir(incomingRoot);
  for (const entry of await RNFS.readDir(incomingRoot)) {
    if (
      entry.name === 'transfer.json' ||
      /^import-\d+-[a-z0-9]+-[01]\.part$/.test(entry.name)
    )
      await RNFS.unlink(entry.path);
  }
}
export async function verifyGGUF(path: string, size: number, expected = '') {
  if (
    Number((await RNFS.stat(path)).size) !== size ||
    (await RNFS.read(path, 4, 0, 'base64')) !== 'R0dVRg=='
  )
    throw new Error('This GGUF file is incomplete or invalid.');
  const hash = (await RNBlobUtil.fs.hash(path, 'sha256')).toLowerCase();
  if (expected && hash !== expected.toLowerCase())
    throw new Error(
      'Checksum failed. The model was not imported. Delete the partial transfer and retry.',
    );
  return hash;
}
export async function makeOffer(
  model: ModelManifest,
  id: string,
): Promise<{ offer: Offer; paths: string[] }> {
  const artifacts = [
    { name: model.fileName, size: model.byteSize, sha256: model.sha256 },
    ...('kind' in model && model.kind === 'vision'
      ? [
          {
            name: (model as VisionManifest).projectorFileName,
            size: (model as VisionManifest).projectorByteSize,
            sha256: (model as VisionManifest).projectorSha256,
          },
        ]
      : []),
  ];
  const paths = artifacts.map(a => artifactPath(a.name));
  for (const [index, artifact] of artifacts.entries()) {
    artifact.sha256 = await verifyGGUF(
      paths[index],
      artifact.size,
      artifact.sha256,
    );
  }
  return {
    offer: parseOffer({
      version: 1,
      id,
      name: model.displayName,
      license: model.license,
      contextLength: model.recommendedContextLength,
      artifacts,
    }),
    paths,
  };
}
export function receivedModel(checkpoint: Checkpoint): ImportedModel {
  const { offer, id } = checkpoint;
  // Only our bundled catalog provides an independent publisher hash; peer claims never do.
  const known = catalogMatch(offer, [
    ...SUPPORTED_MODELS,
    ...SUPPORTED_VISION_MODELS,
  ]);
  const model: ImportedModel = {
    manifestVersion: 1,
    id,
    origin: 'nearby',
    fileName: `${id}.gguf`,
    displayName: offer.name,
    originalFileName: offer.artifacts[0].name,
    byteSize: offer.artifacts[0].size,
    sha256: offer.artifacts[0].sha256,
    sourceUrl: known?.sourceUrl || '',
    url: '',
    license: known?.license || offer.license,
    promptTemplateId: 'native',
    recommendedContextLength: Math.min(2048, offer.contextLength),
    checksumVerified: Boolean(known),
    testedDeviceProfile:
      'Received nearby. Device compatibility must be checked before loading.',
  };
  return offer.artifacts.length === 1
    ? model
    : {
        ...model,
        kind: 'vision',
        projectorFileName: `${id}-projector.gguf`,
        projectorByteSize: offer.artifacts[1].size,
        projectorSha256: offer.artifacts[1].sha256,
        projectorUrl: '',
      };
}
export async function finish(
  checkpoint: Checkpoint,
  register: (model: ImportedModel) => Promise<void>,
  valid: () => boolean,
) {
  const model = receivedModel(checkpoint);
  for (const [index, artifact] of checkpoint.offer.artifacts.entries()) {
    await verifyGGUF(
      partialPath(checkpoint, index),
      artifact.size,
      artifact.sha256,
    );
    if (!valid()) throw new Error('Transfer paused.');
  }
  await RNFS.mkdir(artifactPath(''));
  const names = [
    model.fileName,
    ...('kind' in model ? [model.projectorFileName] : []),
  ];
  const moved: { from: string; to: string }[] = [];
  try {
    for (const [index, name] of names.entries()) {
      if (!valid()) throw new Error('Transfer paused.');
      const from = partialPath(checkpoint, index),
        to = artifactPath(name);
      if (await RNFS.exists(to))
        throw new Error('A previous import occupies this transfer ID.');
      await RNFS.moveFile(from, to);
      moved.push({ from, to });
    }
    await RNFS.writeFile(
      metadataPath(model),
      JSON.stringify({
        manifestVersion: 1,
        modelId: model.id,
        sha256: model.sha256,
      }),
      'utf8',
    );
    if (!valid()) throw new Error('Transfer paused.');
    await register(model);
  } catch (error) {
    for (const file of moved.reverse())
      await RNFS.moveFile(file.to, file.from).catch(() => {});
    if (await RNFS.exists(metadataPath(model)))
      await RNFS.unlink(metadataPath(model)).catch(() => {});
    throw error;
  }
  // Registration succeeded: cleanup failure must not undo or duplicate an installed model.
  if (await RNFS.exists(record)) await RNFS.unlink(record).catch(() => {});
  return model;
}
export const fingerprintCompatible = (a: Offer, b: Offer) =>
  fingerprint(a) === fingerprint(b);
