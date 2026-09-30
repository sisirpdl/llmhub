import {isVisionManifest, SUPPORTED_VISION_MODELS, supportsVision, type VisionManifest} from './visionCatalog'

test('declares a separately gated vision model and projector', () => {
  expect(SUPPORTED_VISION_MODELS).toHaveLength(1)
  expect(isVisionManifest(SUPPORTED_VISION_MODELS[0])).toBe(true)
  expect(supportsVision(SUPPORTED_VISION_MODELS[0])).toBe(true)
  expect(supportsVision({promptTemplateId: 'qwen2'})).toBe(false)
})

test('requires a separately declared projector artifact', () => {
  const incomplete = {manifestVersion: 1, id: 'vision', fileName: 'vision.gguf', kind: 'vision', projectorFileName: '', projectorUrl: '', projectorByteSize: 0, projectorSha256: ''} as VisionManifest
  expect(isVisionManifest(incomplete)).toBe(false)
})