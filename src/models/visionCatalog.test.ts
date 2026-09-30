import {isVisionManifest, SUPPORTED_VISION_MODELS, supportsVision, type VisionManifest} from './visionCatalog'

test('does not expose an untested vision model', () => {
  expect(SUPPORTED_VISION_MODELS).toHaveLength(0)
  expect(supportsVision({promptTemplateId: 'qwen2'})).toBe(false)
})

test('requires a separately declared projector artifact', () => {
  const incomplete = {manifestVersion: 1, id: 'vision', fileName: 'vision.gguf', kind: 'vision', projectorFileName: '', projectorUrl: '', projectorByteSize: 0, projectorSha256: ''} as VisionManifest
  expect(isVisionManifest(incomplete)).toBe(false)
})