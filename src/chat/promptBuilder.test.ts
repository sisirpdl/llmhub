import {buildPrompt, type PromptMessage} from './promptBuilder'

const build = (messages: PromptMessage[], contextLength = 2048) => buildPrompt(messages, 'qwen2', contextLength)

test('builds an empty Qwen conversation with a default system prompt', () => {
  expect(build([]).prompt).toBe('<|im_start|>system\nYou are a helpful assistant.<|im_end|>\n<|im_start|>assistant\n')
})

test('preserves an explicit system prompt', () => {
  expect(build([{role: 'system', content: 'Be concise.'}]).prompt).toContain('<|im_start|>system\nBe concise.<|im_end|>')
})

test('keeps alternating turns in order', () => {
  const result = build([{role: 'user', content: 'Hi'}, {role: 'assistant', content: 'Hello'}, {role: 'user', content: 'How are you?'}])
  expect(result.prompt.indexOf('user\nHi')).toBeLessThan(result.prompt.indexOf('assistant\nHello'))
  expect(result.prompt.indexOf('assistant\nHello')).toBeLessThan(result.prompt.indexOf('user\nHow are you?'))
})

test('retains a prior assistant response', () => {
  expect(build([{role: 'user', content: 'One'}, {role: 'assistant', content: 'Two'}]).prompt).toContain('<|im_start|>assistant\nTwo<|im_end|>')
})

test('preserves special characters without corrupting content', () => {
  const content = 'Use <tags> & "quotes" exactly.'
  expect(build([{role: 'user', content}]).prompt).toContain(content)
})

test('omits only old complete turns when the context budget is exceeded', () => {
  const result = build([{role: 'user', content: 'old '.repeat(1000)}, {role: 'assistant', content: 'old reply'}, {role: 'user', content: 'latest'}], 512)
  expect(result.omittedMessageCount).toBe(1)
  expect(result.prompt).toContain('latest')
  expect(result.prompt).toContain('old reply')
})