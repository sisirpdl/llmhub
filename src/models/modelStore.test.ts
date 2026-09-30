jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/documents',
    getFSInfo: jest.fn(),
    exists: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    downloadFile: jest.fn(),
    moveFile: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}))
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {fs: {hash: jest.fn()}},
}))

import {SUPPORTED_MODELS} from './modelCatalog'
import {downloadModel, hasEnoughSpace, isModelReady, modelPath} from './modelStore'

const mockFS = jest.requireMock('react-native-fs').default
const mockBlob = jest.requireMock('react-native-blob-util').default
const mockGetFSInfo = mockFS.getFSInfo as jest.Mock
const mockExists = mockFS.exists as jest.Mock
const mockUnlink = mockFS.unlink as jest.Mock
const mockMkdir = mockFS.mkdir as jest.Mock
const mockDownloadFile = mockFS.downloadFile as jest.Mock
const mockMoveFile = mockFS.moveFile as jest.Mock
const mockReadFile = mockFS.readFile as jest.Mock
const mockWriteFile = mockFS.writeFile as jest.Mock
const mockHash = mockBlob.fs.hash as jest.Mock
const mockStat = mockFS.stat as jest.Mock
const model = SUPPORTED_MODELS[0]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetFSInfo.mockResolvedValue({freeSpace: model.byteSize + 256 * 1024 * 1024})
  mockExists.mockResolvedValue(false)
  mockStat.mockResolvedValue({size: model.byteSize})
  mockMkdir.mockResolvedValue(undefined)
  mockUnlink.mockResolvedValue(undefined)
  mockMoveFile.mockResolvedValue(undefined)
  mockReadFile.mockResolvedValue(JSON.stringify({manifestVersion: model.manifestVersion, sha256: model.sha256}))
  mockWriteFile.mockResolvedValue(undefined)
  mockDownloadFile.mockReturnValue({promise: Promise.resolve({statusCode: 200})})
})

test('requires model bytes plus the safety margin', async () => {
  expect(await hasEnoughSpace(model)).toBe(true)
  mockGetFSInfo.mockResolvedValue({freeSpace: model.byteSize + 256 * 1024 * 1024 - 1})
  expect(await hasEnoughSpace(model)).toBe(false)
})

test('promotes a verified temporary download to the final path', async () => {
  mockHash.mockResolvedValue(model.sha256)
  const progress = jest.fn()
  await downloadModel(model, progress)
  expect(mockDownloadFile).toHaveBeenCalledWith(expect.objectContaining({toFile: `${modelPath(model)}.part`}))
  expect(mockHash).toHaveBeenCalledWith(`${modelPath(model)}.part`, 'sha256')
  expect(mockMoveFile).toHaveBeenCalledWith(`${modelPath(model)}.part`, modelPath(model))
  expect(mockWriteFile).toHaveBeenCalled()
})

test('does not offer a corrupted or partial existing file as ready', async () => {
  mockExists.mockResolvedValue(true)
  mockStat.mockResolvedValue({size: model.byteSize - 1})
  expect(await isModelReady(model)).toBe(false)
  mockStat.mockResolvedValue({size: model.byteSize})
  mockHash.mockResolvedValue('bad-checksum')
  expect(await isModelReady(model)).toBe(false)
})

test('removes an invalid download and never promotes it', async () => {
  mockHash.mockResolvedValue('bad-checksum')
  await expect(downloadModel(model, jest.fn())).rejects.toThrow('Checksum verification failed')
  expect(mockUnlink).toHaveBeenCalledWith(`${modelPath(model)}.part`)
  expect(mockMoveFile).not.toHaveBeenCalled()
})