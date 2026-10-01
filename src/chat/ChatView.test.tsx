import React from 'react'
import ReactTestRenderer from 'react-test-renderer'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {ChatView} from './ChatView'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {getItem: jest.fn().mockResolvedValue(null), setItem: jest.fn().mockResolvedValue(undefined), removeItem: jest.fn().mockResolvedValue(undefined)},
}))
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}))

const theme = {card: {}, text: {}, secondaryText: {}, accent: {}, primaryButton: {}, primaryButtonText: {}, secondaryButton: {}, secondaryButtonText: {}, error: {}}

test('keeps sending unavailable until a model context exists', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<ChatView context={null} theme={theme} />) })
  const sendButton = renderer!.root.findByProps({accessibilityLabel: 'Send message'})
  expect(sendButton.props.disabled).toBe(true)
})

test('creates a user turn and streams an assistant response', async () => {
  const completion = jest.fn(async (_params, onToken) => {
    onToken({token: 'local '})
    onToken({token: 'reply'})
    return {text: 'local reply'}
  })
  const context = {completion, stopCompletion: jest.fn()} as never
  let renderer: ReactTestRenderer.ReactTestRenderer
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<ChatView context={context} theme={theme} />) })
  const input = renderer!.root.findByProps({accessibilityLabel: 'Message'})
  await ReactTestRenderer.act(async () => { input.props.onChangeText('Hello locally') })
  const sendButton = renderer!.root.findByProps({accessibilityLabel: 'Send message'})
  await ReactTestRenderer.act(async () => { await sendButton.props.onPress() })
  expect(completion).toHaveBeenCalled()
  expect(completion.mock.calls[0][0]).not.toHaveProperty('media_paths')
  const renderedText = renderer!.root.findAllByType('Text' as never).map(node => node.props.children).flat().join(' ')
  expect(renderedText).toContain('YOU')
  expect(renderedText).toContain('local reply')
  expect(AsyncStorage.setItem).toHaveBeenCalled()
})