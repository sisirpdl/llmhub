import type {ModelManifest, PromptTemplateId} from './modelCatalog'

export type VisionManifest = ModelManifest & {
  kind: 'vision'
  projectorFileName: string
  projectorUrl: string
  projectorByteSize: number
  projectorSha256: string
}

// Keep this list empty until a vision model and projector have passed device testing.
export const SUPPORTED_VISION_MODELS: VisionManifest[] = []

export function supportsVision(model: Pick<ModelManifest, 'promptTemplateId'> & {kind?: string}): boolean {
  return model.kind === 'vision' && SUPPORTED_VISION_MODELS.some(candidate => candidate.promptTemplateId === model.promptTemplateId)
}

export function isVisionManifest(model: VisionManifest): boolean {
  return Boolean(
    model.kind === 'vision' && model.manifestVersion > 0 && model.id &&
      model.fileName.endsWith('.gguf') && model.projectorFileName &&
      model.projectorUrl.startsWith('https://') && model.projectorByteSize > 0 &&
      /^[a-f0-9]{64}$/i.test(model.projectorSha256),
  )
}

export type VisionPromptTemplateId = PromptTemplateId | 'vision-chat'