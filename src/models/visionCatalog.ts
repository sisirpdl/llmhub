import type {ModelManifest, PromptTemplateId} from './modelCatalog'

export type VisionManifest = ModelManifest & {
  kind: 'vision'
  projectorFileName: string
  projectorUrl: string
  projectorByteSize: number
  projectorSha256: string
}

export const SUPPORTED_VISION_MODELS: VisionManifest[] = [
  {
    manifestVersion: 1,
    id: 'smolvlm-instruct-q4_k_m',
    displayName: 'SmolVLM Instruct',
    fileName: 'SmolVLM-Instruct-Q4_K_M.gguf',
    url: 'https://huggingface.co/ggml-org/SmolVLM-Instruct-GGUF/resolve/main/SmolVLM-Instruct-Q4_K_M.gguf',
    byteSize: 1112242368,
    sha256: 'dc80966bd84789de64115f07888939c03abb1714d431c477dfb405517a554af5',
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/ggml-org/SmolVLM-Instruct-GGUF',
    promptTemplateId: 'qwen2',
    recommendedContextLength: 2048,
    testedDeviceProfile: 'ARM64 phones with 8 GB RAM or more; vision preview',
    kind: 'vision',
    projectorFileName: 'mmproj-SmolVLM-Instruct-Q8_0.gguf',
    projectorUrl: 'https://huggingface.co/ggml-org/SmolVLM-Instruct-GGUF/resolve/main/mmproj-SmolVLM-Instruct-Q8_0.gguf',
    projectorByteSize: 592521344,
    projectorSha256: '86b84aa7babf1ab51a6366d973b9d380354e92c105afaa4f172cc76d044da739',
  },
]

export function supportsVision(model: Pick<ModelManifest, 'promptTemplateId'> & {kind?: string}): boolean {
  return model.kind === 'vision'
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