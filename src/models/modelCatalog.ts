export type PromptTemplateId = 'qwen2'

export type ModelManifest = {
  manifestVersion: number
  id: string
  displayName: string
  fileName: string
  url: string
  byteSize: number
  sha256: string
  license: string
  sourceUrl: string
  promptTemplateId: PromptTemplateId
  recommendedContextLength: number
  testedDeviceProfile: string
}

export const SUPPORTED_MODELS: ModelManifest[] = [
  {
    manifestVersion: 1,
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    displayName: 'Qwen2.5 1.5B Instruct',
    fileName: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    byteSize: 1117320736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    license: 'Apache-2.0',
    sourceUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    promptTemplateId: 'qwen2',
    recommendedContextLength: 2048,
    testedDeviceProfile: 'ARM64 phones with 6 GB RAM or more',
  },
]

export function isValidManifest(model: ModelManifest): boolean {
  return Boolean(
    model.manifestVersion > 0 && model.id && model.displayName && model.fileName.endsWith('.gguf') &&
      model.url.startsWith('https://') && model.byteSize > 0 &&
      /^[a-f0-9]{64}$/i.test(model.sha256) && model.license &&
      model.sourceUrl.startsWith('https://') && model.promptTemplateId &&
      model.recommendedContextLength > 0 && model.testedDeviceProfile,
  )
}