import RNBlobUtil from 'react-native-blob-util'
import RNFS from 'react-native-fs'
import type {ModelManifest} from './modelCatalog'

export type DownloadProgress = {bytesWritten: number; totalBytes: number}

const MODEL_DIRECTORY = `${RNFS.DocumentDirectoryPath}/models`
const SAFETY_MARGIN_BYTES = 256 * 1024 * 1024

export function modelPath(model: ModelManifest): string { return `${MODEL_DIRECTORY}/${model.fileName}` }

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
    const stats = await RNFS.stat(path)
    if (stats.size !== model.byteSize) return false
    const checksum = await RNBlobUtil.fs.hash(path, 'sha256')
    return checksum.toLowerCase() === model.sha256.toLowerCase()
  } catch {
    return false
  }
}

export async function downloadModel(model: ModelManifest, onProgress: (progress: DownloadProgress) => void, onValidationStart?: () => void): Promise<void> {
  if (!(await hasEnoughSpace(model))) throw new Error('Not enough free space. Remove another model or free storage and retry.')
  await RNFS.mkdir(MODEL_DIRECTORY)
  const temporaryPath = `${modelPath(model)}.part`
  const finalPath = modelPath(model)
  if (await RNFS.exists(temporaryPath)) await RNFS.unlink(temporaryPath)
  const result = await RNFS.downloadFile({
    fromUrl: model.url,
    toFile: temporaryPath,
    progressDivider: 1,
    progress: ({bytesWritten, contentLength}) => onProgress({bytesWritten, totalBytes: contentLength || model.byteSize}),
  }).promise
  if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`Download failed with HTTP ${result.statusCode}.`)
  onValidationStart?.()
  const checksum = await RNBlobUtil.fs.hash(temporaryPath, 'sha256')
  if (checksum.toLowerCase() !== model.sha256.toLowerCase()) {
    await RNFS.unlink(temporaryPath)
    throw new Error('Checksum verification failed. The partial file was removed.')
  }
  if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath)
  await RNFS.moveFile(temporaryPath, finalPath)
}

export async function deleteModel(model: ModelManifest): Promise<void> {
  const finalPath = modelPath(model)
  const temporaryPath = `${finalPath}.part`
  if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath)
  if (await RNFS.exists(temporaryPath)) await RNFS.unlink(temporaryPath)
}