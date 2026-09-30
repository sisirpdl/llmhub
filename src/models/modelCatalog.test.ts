import {isValidManifest, SUPPORTED_MODELS} from './modelCatalog'

test('ships one complete supported text model manifest', () => {
  const model = SUPPORTED_MODELS[0]
  expect(isValidManifest(model)).toBe(true)
  expect(model.fileName).toMatch(/\.gguf$/)
  expect(model.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(model.promptTemplateId).toBe('qwen2')
})

test('rejects unsafe or incomplete manifest metadata', () => {
  const model = {...SUPPORTED_MODELS[0], url: 'http://example.test/model.gguf'}
  expect(isValidManifest(model)).toBe(false)
  expect(isValidManifest({...SUPPORTED_MODELS[0], sha256: 'partial'})).toBe(false)
})