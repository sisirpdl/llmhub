import { hfAuthHeaders } from './hfAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import type { ModelManifest } from './modelCatalog';
import type { VisionManifest } from './visionCatalog';
import {
  artifactPath,
  getAvailableSpace,
  metadataPath,
  type DownloadProgress,
} from './modelStore';
import { hubDownloadUrl, type HubDetails, type HubFile } from './huggingFace';
export type ImportedModel = (ModelManifest | VisionManifest) & {
  origin: 'huggingface' | 'remote' | 'local' | 'nearby';
  originalFileName: string;
  checksumVerified?: boolean;
  repositoryId?: string;
  revision?: string;
};
export type PickedGGUF = { uri: string; name: string; size: number | null };
const KEY = '@llmhub/imported-models-v1';
const MARGIN = 256 * 1024 ** 2;
export const newImportId = () =>
  `import-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export function isImported(model: ModelManifest): model is ImportedModel {
  return 'origin' in model;
}
export async function readImportedModels(): Promise<ImportedModel[]> {
  const value = await AsyncStorage.getItem(KEY);
  if (!value) return [];
  const data = JSON.parse(value);
  if (!Array.isArray(data) || !data.every(isSafeImport))
    throw new Error('Saved model imports could not be restored.');
  return data;
}
function isSafeImport(model: ImportedModel): boolean {
  return Boolean(
    model &&
      typeof model.id === 'string' &&
      model.id.startsWith('import-') &&
      /^[a-z0-9-]+\.gguf$/i.test(model.fileName) &&
      ['huggingface', 'remote', 'local', 'nearby'].includes(model.origin) &&
      typeof model.displayName === 'string' &&
      typeof model.originalFileName === 'string' &&
      typeof model.sha256 === 'string' &&
      (model.sha256 === '' || /^[a-f0-9]{64}$/i.test(model.sha256)) &&
      Number.isFinite(model.byteSize) &&
      model.byteSize >= 0 &&
      model.promptTemplateId === 'native' &&
      (!('kind' in model) ||
        (model.kind === 'vision' &&
          /^[a-z0-9-]+\.gguf$/i.test(model.projectorFileName))),
  );
}
// Writes are serialized so deleting a model cannot race a completed download registration.
let writes = Promise.resolve();
export async function saveImportedModels(
  models: ImportedModel[],
): Promise<void> {
  if (!models.every(isSafeImport))
    throw new Error('Invalid imported model metadata.');
  const operation = writes
    .catch(() => {})
    .then(() => AsyncStorage.setItem(KEY, JSON.stringify(models)));
  writes = operation;
  return operation;
}
function draft(
  id: string,
  name: string,
  origin: ImportedModel['origin'],
): ImportedModel {
  return {
    manifestVersion: 1,
    id,
    displayName: name.replace(/\.gguf$/i, ''),
    fileName: `${id}.gguf`,
    originalFileName: name,
    origin,
    url: '',
    sourceUrl: '',
    byteSize: 0,
    sha256: '',
    license: 'See model source',
    promptTemplateId: 'native',
    recommendedContextLength: 2048,
    testedDeviceProfile:
      'User-added model. Compatibility and memory requirements depend on your device.',
  };
}
export function fromHub(
  details: HubDetails,
  file: HubFile,
  projector?: HubFile,
): ImportedModel {
  if (file.projector || file.split)
    throw new Error(
      'Choose a single-file model, not a projector or split shard.',
    );
  if (projector && (!projector.projector || projector.split))
    throw new Error('Choose a compatible projector file.');
  const id = newImportId();
  const model = {
    ...draft(id, file.path.split('/').pop()!, 'huggingface'),
    byteSize: file.size,
    sha256: file.sha256 || '',
    url: hubDownloadUrl(details.model.id, details.revision, file.path),
    sourceUrl: `https://huggingface.co/${details.model.id}`,
    license: details.license,
    repositoryId: details.model.id,
    revision: details.revision,
    checksumVerified: Boolean(file.sha256),
  };
  if (!projector) return model;
  return {
    ...model,
    kind: 'vision',
    projectorFileName: `${id}-projector.gguf`,
    projectorUrl: hubDownloadUrl(
      details.model.id,
      details.revision,
      projector.path,
    ),
    projectorByteSize: projector.size,
    projectorSha256: projector.sha256 || '',
  };
}
export function validateRemoteUrl(value: string): string {
  const url = value.trim();
  if (!/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url))
    throw new Error('Enter a valid HTTPS download URL.');
  const authority = url.slice(8).split(/[/?#]/)[0];
  if (
    authority.includes('@') ||
    url.includes('\\') ||
    authority.includes('%') ||
    !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(authority)
  )
    throw new Error('Enter an HTTPS URL without embedded credentials.');
  return url;
}
export function fromRemote(
  name: string,
  url: string,
  checksum: string,
  size = 0,
): ImportedModel {
  const validUrl = validateRemoteUrl(url);
  if (checksum.trim() && !/^[a-f0-9]{64}$/i.test(checksum.trim()))
    throw new Error('SHA-256 must contain exactly 64 hexadecimal characters.');
  const fileName =
    name.trim() ||
    decodeURIComponent(
      validUrl.slice(8).split(/[?#]/)[0].split('/').slice(1).pop() ||
        'Remote model.gguf',
    );
  return {
    ...draft(newImportId(), fileName, 'remote'),
    url: validUrl,
    sourceUrl: validUrl,
    sha256: checksum.trim().toLowerCase(),
    byteSize: size,
    checksumVerified: Boolean(checksum.trim()),
  };
}
export async function probeSize(
  url: string,
  signal?: AbortSignal,
): Promise<number> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  const cancel = () => abort.abort();
  signal?.addEventListener('abort', cancel);
  try {
    const response = await fetch(validateRemoteUrl(url), {
      method: 'HEAD',
      signal: abort.signal,
    });
    const length = Number(response.headers.get('content-length'));
    if (response.ok && length > 0) return length;
  } catch {
    /* Hosts may not support HEAD; use download progress instead. */
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  return 0;
}
export async function pickGGUF(): Promise<PickedGGUF | null> {
  const { pick, types, isErrorWithCode, errorCodes } = await import(
    '@react-native-documents/picker'
  );
  try {
    const [file] = await pick({
      type: [types.allFiles],
      allowMultiSelection: false,
      mode: 'import',
    });
    if (!file.name?.toLowerCase().endsWith('.gguf') || file.isVirtual)
      throw new Error(
        'Choose a local .gguf file. Virtual documents are not supported.',
      );
    return { uri: file.uri, name: file.name, size: file.size };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
}
async function verifyFile(
  path: string,
  expected: string,
  expectedSize = 0,
): Promise<{ sha256: string; size: number }> {
  const stats = await RNFS.stat(path);
  const size = Number(stats.size);
  if (size < 8 || (expectedSize > 0 && size !== expectedSize))
    throw new Error(
      'The downloaded file is incomplete or has an unexpected size.',
    );
  if ((await RNFS.read(path, 4, 0, 'base64')) !== 'R0dVRg==')
    throw new Error(
      'This file is not a GGUF model. The URL may point to a web page instead of a download.',
    );
  const sha256 = (await RNBlobUtil.fs.hash(path, 'sha256')).toLowerCase();
  if (expected && sha256 !== expected.toLowerCase())
    throw new Error('Checksum verification failed. The file was not imported.');
  return { sha256, size };
}
async function commitFile(temporary: string, final: string) {
  if (await RNFS.exists(final)) await RNFS.unlink(final);
  await RNFS.moveFile(temporary, final);
}
async function persistMetadata(model: ImportedModel) {
  await RNFS.writeFile(
    metadataPath(model),
    JSON.stringify({
      manifestVersion: model.manifestVersion,
      modelId: model.id,
      sha256: model.sha256,
    }),
    'utf8',
  );
}
export async function downloadImport(
  model: ImportedModel,
  onProgress: (p: DownloadProgress) => void,
  onValidation: () => void,
  token = '',
): Promise<ImportedModel> {
  const artifacts = [
    {
      name: model.fileName,
      url: model.url,
      size: model.byteSize,
      checksum: model.sha256,
    },
    ...('kind' in model && model.kind === 'vision'
      ? [
          {
            name: model.projectorFileName,
            url: model.projectorUrl,
            size: model.projectorByteSize,
            checksum: model.projectorSha256,
          },
        ]
      : []),
  ];
  const knownTotal = artifacts.reduce((sum, a) => sum + a.size, 0);
  const free = await getAvailableSpace();
  if (free < knownTotal + MARGIN)
    throw new Error('Not enough storage. Free space and retry.');
  await RNFS.mkdir(artifactPath(''));
  let completedBytes = 0;
  let updated = { ...model };
  const created: string[] = [];
  try {
    for (const [index, artifact] of artifacts.entries()) {
      const temporary = `${artifactPath(artifact.name)}.part`;
      created.push(temporary);
      if (await RNFS.exists(temporary)) await RNFS.unlink(temporary);
      const headers = hfAuthHeaders(artifact.url, token);
      let exceededSpace = false;
      let jobId: number | undefined;
      const task = RNFS.downloadFile({
        fromUrl: artifact.url,
        toFile: temporary,
        headers,
        progressDivider: 1,
        progress: ({ bytesWritten, contentLength }) => {
          if (completedBytes + bytesWritten > free - MARGIN && !exceededSpace) {
            exceededSpace = true;
            if (jobId !== undefined) RNFS.stopDownload(jobId);
          }
          onProgress({
            bytesWritten: completedBytes + bytesWritten,
            totalBytes: artifacts.every(a => a.size > 0)
              ? knownTotal
              : artifacts.length === 1 && contentLength > 0
              ? contentLength
              : 0,
          });
        },
      });
      jobId = task.jobId;
      if (exceededSpace) RNFS.stopDownload(jobId);
      const result = await task.promise;
      if (exceededSpace)
        throw new Error(
          'The download exceeded available storage. Free space and retry.',
        );
      if (result.statusCode < 200 || result.statusCode >= 300)
        throw new Error(
          result.statusCode === 401 || result.statusCode === 403
            ? 'Access denied. Accept the Hugging Face license and enter a read token in Settings.'
            : `Download failed with HTTP ${result.statusCode}.`,
        );
      onValidation();
      const verified = await verifyFile(
        temporary,
        artifact.checksum,
        artifact.size,
      );
      await commitFile(temporary, artifactPath(artifact.name));
      created.push(artifactPath(artifact.name));
      completedBytes += verified.size;
      if (index === 0)
        updated = {
          ...updated,
          byteSize: verified.size,
          sha256: verified.sha256,
        };
      else if ('kind' in updated && updated.kind === 'vision')
        updated = {
          ...updated,
          projectorByteSize: verified.size,
          projectorSha256: verified.sha256,
        };
    }
    created.push(metadataPath(updated));
    await persistMetadata(updated);
    return updated;
  } catch (error) {
    for (const path of created) {
      if (await RNFS.exists(path)) await RNFS.unlink(path).catch(() => {});
    }
    throw error;
  }
}
export async function importLocal(
  file: PickedGGUF,
  projector?: PickedGGUF,
): Promise<ImportedModel> {
  const id = newImportId();
  const model = draft(id, file.name, 'local');
  const expected = Number(file.size || 0) + Number(projector?.size || 0);
  if ((await getAvailableSpace()) < expected + MARGIN)
    throw new Error('Not enough space to copy these files into app storage.');
  const { keepLocalCopy } =
    require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
  await RNFS.mkdir(artifactPath(''));
  const paths: string[] = [];
  let updated = model;
  try {
    for (const [index, picked] of [
      file,
      ...(projector ? [projector] : []),
    ].entries()) {
      const name = index === 0 ? model.fileName : `${id}-projector.gguf`;
      const [copy] = await keepLocalCopy({
        files: [{ uri: picked.uri, fileName: name }],
        destination: 'cachesDirectory',
      });
      if (copy.status !== 'success')
        throw new Error(copy.copyError || 'The file could not be copied.');
      const path = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
      paths.push(path);
      const verified = await verifyFile(path, '', Number(picked.size || 0));
      await commitFile(path, artifactPath(name));
      paths.push(artifactPath(name));
      updated =
        index === 0
          ? { ...updated, byteSize: verified.size, sha256: verified.sha256 }
          : {
              ...updated,
              kind: 'vision',
              projectorFileName: name,
              projectorUrl: '',
              projectorByteSize: verified.size,
              projectorSha256: verified.sha256,
            };
    }
    paths.push(metadataPath(updated));
    await persistMetadata(updated);
    return updated;
  } catch (error) {
    for (const path of paths) {
      if (await RNFS.exists(path)) await RNFS.unlink(path).catch(() => {});
    }
    throw error;
  }
}

export async function discardImport(model: ImportedModel): Promise<void> {
  const paths = [
    artifactPath(model.fileName),
    metadataPath(model),
    ...('kind' in model && model.kind === 'vision'
      ? [artifactPath(model.projectorFileName)]
      : []),
  ];
  for (const path of paths)
    if (await RNFS.exists(path)) await RNFS.unlink(path);
}
