import type {PromptTemplateId} from '../models/modelCatalog'

export type PromptMessage = {role: 'system' | 'user' | 'assistant'; content: string}
export type PromptBuildResult = {prompt: string; omittedMessageCount: number; truncatedMessage: boolean}

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.'

export function buildPrompt(
  messages: PromptMessage[],
  templateId: PromptTemplateId,
  contextLength: number,
): PromptBuildResult {
  if (templateId !== 'qwen2') throw new Error(`Unsupported prompt template: ${templateId}`)
  const system = messages.find(message => message.role === 'system')?.content || DEFAULT_SYSTEM_PROMPT
  const conversation = messages.filter(message => message.role !== 'system')
  const maxCharacters = Math.max(512, contextLength * 4 - 512)
  const selected: PromptMessage[] = []
  let usedCharacters = system.length
  let truncatedMessage = false

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index]
    const messageCharacters = message.content.length + message.role.length + 32
    if (usedCharacters + messageCharacters > maxCharacters) {
      if (selected.length === 0) {
        const availableCharacters = Math.max(1, maxCharacters - usedCharacters - message.role.length - 32)
        selected.unshift({...message, content: message.content.slice(-availableCharacters)})
        truncatedMessage = true
      }
      break
    }
    selected.unshift(message)
    usedCharacters += messageCharacters
  }

  const omittedMessageCount = conversation.length - selected.length
  const lines = [`<|im_start|>system\n${system}<|im_end|>`]
  selected.forEach(message => lines.push(`<|im_start|>${message.role}\n${message.content}<|im_end|>`))
  lines.push('<|im_start|>assistant\n')
  return {prompt: lines.join('\n'), omittedMessageCount, truncatedMessage}
}