import RNBlobUtil from 'react-native-blob-util'
import RNFS from 'react-native-fs'
import {hfAuthHeaders, downloadHttpError} from './hfAuth'
import type {ModelManifest} from './modelCatalog'

export type DownloadProgress = {bytesWritten: number; totalBytes: number}

const MODEL_DIRECTORY = `${RNFS.DocumentDirectoryPath}/models`
const SAFETY_MARGIN_BYTES = 256 * 1024 * 1024

export function modelPath(model: ModelManifest): string { return `${MODEL_DIRECTORY}/${model.fileName}` }
export function metadataPath(model: ModelManifest): string { return `${modelPath(model)}.json` }
export function artifactPath(fileName: string): string { return `${MODEL_DIRECTORY}/${fileName}` }

export async function downloadVerifiedArtifact(
  artifact: {fileName: string; url: string; byteSize: number; sha256: string},
  onProgress: (progress: DownloadProgress) => void,
  token = '',
): Promise<string> {
  if ((await getAvailableSpace()) < artifact.byteSize + SAFETY_MARGIN_BYTES) throw new Error('Not enough free space for the vision model and projector.')
  await RNFS.mkdir(MODEL_DIRECTORY)
  const finalPath = artifactPath(artifact.fileName)
  const temporaryPath = `${finalPath}.part`
  if (await RNFS.exists(temporaryPath)) await RNFS.unlink(temporaryPath)
  const result = await RNFS.downloadFile({fromUrl: artifact.url, toFile: temporaryPath, headers: hfAuthHeaders(artifact.url, token), progressDivider: 1, progress: ({bytesWritten, contentLength}) => onProgress({bytesWritten, totalBytes: contentLength || artifact.byteSize})}).promise
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(downloadHttpError(result.statusCode))
  const checksum = await RNBlobUtil.fs.hash(temporaryPath, 'sha256')
  if (checksum.toLowerCase() !== artifact.sha256.toLowerCase()) { await RNFS.unlink(temporaryPath); throw new Error(`Checksum verification failed for ${artifact.fileName}.`) }
  if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath)
  await RNFS.moveFile(temporaryPath, finalPath)
  return finalPath
}

export async function getAvailableSpace(): Promise<number> {
  const {freeSpace} = await RNFS.getFSInfo()
  return freeSpace
}

export async function hasEnoughSpace(model: ModelManifest): Promise<boolean> {
  return (await getAvailableSpace()) >= model.byteSize + SAFETY_MARGIN_BYTES
}

export async function isModelReady(model: ModelManifest): Promise<boolean> {
  try {
    const path = modelPath(model)
    if (!(await RNFS.exists(path))) return false
    const metadataFile = metadataPath(model)
    if (!(await RNFS.exists(metadataFile))) return false
    const metadata = JSON.parse(await RNFS.readFile(metadataFile, 'utf8')) as {manifestVersion?: number; sha256?: string}
    if (metadata.manifestVersion !== model.manifestVersion || metadata.sha256?.toLowerCase() !== model.sha256.toLowerCase()) return false
    const stats = await RNFS.stat(path)
    if (stats.size !== model.byteSize) return false
    const checksum = await RNBlobUtil.fs.hash(path, 'sha256')
    return checksum.toLowerCase() === model.sha256.toLowerCase()
  } catch {
    return false
  }
}

export async function downloadModel(model: ModelManifest, onProgress: (progress: DownloadProgress) => void, onValidationStart?: () => void, token = ''): Promise<void> {
  if (!(await hasEnoughSpace(model))) throw new Error('Not enough free space. Remove another model or free storage and retry.')
  await RNFS.mkdir(MODEL_DIRECTORY)
  const temporaryPath = `${modelPath(model)}.part`
  const finalPath = modelPath(model)
  if (await RNFS.exists(temporaryPath)) await RNFS.unlink(temporaryPath)
  const result = await RNFS.downloadFile({
    fromUrl: model.url,
    headers: hfAuthHeaders(model.url, token),
    toFile: temporaryPath,
    progressDivider: 1,
    progress: ({bytesWritten, contentLength}) => onProgress({bytesWritten, totalBytes: contentLength || model.byteSize}),
  }).promise
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(downloadHttpError(result.statusCode))
  onValidationStart?.()
  const checksum = await RNBlobUtil.fs.hash(temporaryPath, 'sha256')
  if (checksum.toLowerCase() !== model.sha256.toLowerCase()) {
    await RNFS.unlink(temporaryPath)
    throw new Error('Checksum verification failed. The partial file was removed.')
  }
  if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath)
  await RNFS.moveFile(temporaryPath, finalPath)
  await RNFS.writeFile(metadataPath(model), JSON.stringify({manifestVersion: model.manifestVersion, modelId: model.id, sha256: model.sha256}), 'utf8')
}

export async function deleteModel(model: ModelManifest): Promise<void> {
  const finalPath = modelPath(model)
  const temporaryPath = `${finalPath}.part`
  const metadataFile = metadataPath(model)
  if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath)
  if (await RNFS.exists(temporaryPath)) await RNFS.unlink(temporaryPath)
  if (await RNFS.exists(metadataFile)) await RNFS.unlink(metadataFile)
}