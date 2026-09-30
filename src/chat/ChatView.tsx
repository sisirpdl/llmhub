import {useEffect, useRef, useState} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native'
import type {LlamaContext, TokenData} from 'llama.rn'
import {SUPPORTED_MODELS} from '../models/modelCatalog'
import {buildPrompt, type PromptMessage} from './promptBuilder'

type Message = {id: string; role: 'user' | 'assistant' | 'system'; content: string}
type Theme = {card: object; text: object; secondaryText: object; accent: object; primaryButton: object; primaryButtonText: object; secondaryButton: object; secondaryButtonText: object; error: object}
const STORAGE_KEY = '@llmhub/conversation'
const SETTINGS_KEY = '@llmhub/chat-settings'

export function ChatView({context, theme, onGenerationStateChange, onBackgroundRelease}: {context: LlamaContext | null; theme: Theme; onGenerationStateChange?: (active: boolean) => void; onBackgroundRelease?: () => Promise<void>}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [omittedNotice, setOmittedNotice] = useState(false)
  const [temperature, setTemperature] = useState('0.7')
  const [maxTokens, setMaxTokens] = useState('256')
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const tokenBuffer = useRef('')
  const activeAssistantId = useRef<string | null>(null)
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null)
  const listRef = useRef<ScrollView>(null)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(value => {
      if (!value) return
      try { setMessages(JSON.parse(value) as Message[]) } catch { setError('Saved conversation could not be restored.') }
    }).catch(() => setError('Saved conversation could not be restored.'))
    AsyncStorage.getItem(SETTINGS_KEY).then(value => {
      if (value) {
        try {
          const settings = JSON.parse(value) as {temperature?: string; maxTokens?: string}
          if (settings.temperature) setTemperature(settings.temperature)
          if (settings.maxTokens) setMaxTokens(settings.maxTokens)
        } catch { setError('Saved generation settings could not be restored.') }
      }
      setSettingsLoaded(true)
    }).catch(() => { setSettingsLoaded(true); setError('Saved generation settings could not be restored.') })
    return () => { if (frame.current) cancelAnimationFrame(frame.current) }
  }, [])

  useEffect(() => {
    if (messages.length) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(messages)).catch(() => setError('Conversation could not be saved.'))
  }, [messages])

  useEffect(() => {
    if (settingsLoaded) AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({temperature, maxTokens})).catch(() => setError('Generation settings could not be saved.'))
  }, [maxTokens, settingsLoaded, temperature])

  useEffect(() => {
    onGenerationStateChange?.(sending)
  }, [onGenerationStateChange, sending])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active' && sending && context) {
        context.stopCompletion().then(() => onBackgroundRelease?.()).catch(() => {})
        setSending(false)
        setError('Generation was interrupted when the app left the foreground.')
      }
    })
    return () => subscription.remove()
  }, [context, onBackgroundRelease, sending])

  function flushTokens() {
    frame.current = null
    const assistantId = activeAssistantId.current
    if (!assistantId) return
    const content = tokenBuffer.current
    setMessages(current => current.map(message => message.id === assistantId ? {...message, content} : message))
  }

  function queueToken(data: TokenData) {
    tokenBuffer.current += data.token || data.content || ''
    if (!frame.current) frame.current = requestAnimationFrame(flushTokens)
  }

  async function sendMessage() {
    const content = draft.trim()
    if (!content || !context || sending) return
    const parsedTemperature = Number(temperature)
    const parsedMaxTokens = Number(maxTokens)
    if (!Number.isFinite(parsedTemperature) || parsedTemperature < 0 || parsedTemperature > 2 || !Number.isInteger(parsedMaxTokens) || parsedMaxTokens < 1 || parsedMaxTokens > 4096) {
      setError('Temperature must be 0-2 and maximum output tokens must be 1-4096.')
      return
    }
    setDraft('')
    setError('')
    const userMessage: Message = {id: `${Date.now()}-user`, role: 'user', content}
    const assistantMessage: Message = {id: `${Date.now()}-assistant`, role: 'assistant', content: ''}
    const nextMessages = [...messages, userMessage, assistantMessage]
    setMessages(nextMessages)
    setSending(true)
    activeAssistantId.current = assistantMessage.id
    tokenBuffer.current = ''
    try {
      const promptResult = buildPrompt(nextMessages.slice(0, -1) as PromptMessage[], SUPPORTED_MODELS[0].promptTemplateId, SUPPORTED_MODELS[0].recommendedContextLength)
      setOmittedNotice(promptResult.omittedMessageCount > 0)
      const result = await context.completion({prompt: promptResult.prompt, n_predict: parsedMaxTokens, temperature: parsedTemperature}, queueToken)
      if (frame.current) cancelAnimationFrame(frame.current)
      flushTokens()
      if (result.text && !tokenBuffer.current) tokenBuffer.current = result.text
      flushTokens()
    } catch (completionError) {
      if (tokenBuffer.current) flushTokens()
      setError(completionError instanceof Error ? completionError.message : 'Generation failed. Retry the message.')
    } finally {
      activeAssistantId.current = null
      setSending(false)
    }
  }

  async function stopGeneration() {
    if (!context || !sending) return
    await context.stopCompletion().catch(() => {})
    if (frame.current) cancelAnimationFrame(frame.current)
    flushTokens()
    activeAssistantId.current = null
    setSending(false)
    setError('Generation stopped. The partial response was kept.')
  }

  function resetConversation() {
    setMessages([])
    setOmittedNotice(false)
    setError('')
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => setError('Conversation could not be reset.'))
  }

  return <View style={styles.container}>
    {!context ? <View style={[styles.empty, theme.card]}><Text style={[styles.emptyTitle, theme.text]}>Load a model to chat</Text><Text style={[styles.emptyText, theme.secondaryText]}>Choose a model, download it, and complete the native smoke check first.</Text></View> : null}
    <ScrollView ref={listRef} style={styles.messages} contentContainerStyle={styles.messageContent} onContentSizeChange={() => listRef.current?.scrollToEnd({animated: true})}>
      {messages.length === 0 && context ? <Text style={[styles.emptyText, theme.secondaryText]}>Your private conversation starts here.</Text> : null}
      {messages.map(message => <View key={message.id} style={[styles.bubble, message.role === 'user' ? styles.userBubble : [styles.assistantBubble, theme.card]]}><Text style={[styles.role, theme.accent]}>{message.role === 'user' ? 'YOU' : 'MODEL'}</Text><Text accessibilityLiveRegion={message.role === 'assistant' ? 'polite' : 'none'} style={[styles.messageText, theme.text]}>{message.content || (sending ? 'Thinking...' : '')}</Text></View>)}
    </ScrollView>
    {error ? <Text style={[styles.error, theme.error]}>{error}</Text> : null}
    {omittedNotice ? <Text style={[styles.notice, theme.secondaryText]}>Older complete turns were omitted to fit the model context window.</Text> : null}
    <View style={styles.settings}><Text style={[styles.settingLabel, theme.secondaryText]}>Temperature</Text><TextInput accessibilityLabel="Temperature" keyboardType="decimal-pad" value={temperature} onChangeText={setTemperature} style={[styles.settingInput, theme.card, theme.text]} /><Text style={[styles.settingLabel, theme.secondaryText]}>Max tokens</Text><TextInput accessibilityLabel="Maximum output tokens" keyboardType="number-pad" value={maxTokens} onChangeText={setMaxTokens} style={[styles.settingInput, theme.card, theme.text]} /><Pressable accessibilityLabel="Reset conversation" onPress={resetConversation}><Text style={[styles.resetText, theme.accent]}>Reset</Text></Pressable></View>
    <View style={styles.composer}><TextInput accessibilityLabel="Message" value={draft} onChangeText={setDraft} editable={Boolean(context) && !sending} multiline placeholder="Ask something locally" placeholderTextColor="#89938d" style={[styles.input, theme.card, theme.text]} /><Pressable accessibilityLabel={sending ? 'Stop generation' : 'Send message'} disabled={!context || (!sending && !draft.trim())} onPress={sending ? stopGeneration : sendMessage} style={[styles.sendButton, sending ? theme.secondaryButton : theme.primaryButton, (!context || (!sending && !draft.trim())) && styles.disabled]}><Text style={[styles.sendText, sending ? theme.secondaryButtonText : theme.primaryButtonText]}>{sending ? 'Stop' : 'Send'}</Text></Pressable></View>
  </View>
}

const styles = StyleSheet.create({container: {flex: 1}, messages: {flex: 1}, messageContent: {gap: 12, paddingBottom: 12, paddingTop: 20}, empty: {borderRadius: 12, marginTop: 20, padding: 18}, emptyTitle: {fontSize: 18, fontWeight: '800'}, emptyText: {fontSize: 14, lineHeight: 20, marginTop: 6}, bubble: {borderRadius: 12, maxWidth: '90%', padding: 14}, userBubble: {alignSelf: 'flex-end', backgroundColor: '#dcebe3'}, assistantBubble: {alignSelf: 'flex-start'}, role: {fontSize: 10, fontWeight: '800', letterSpacing: 1}, messageText: {fontSize: 15, lineHeight: 22, marginTop: 5}, settings: {alignItems: 'center', flexDirection: 'row', gap: 6, paddingTop: 8}, settingLabel: {fontSize: 11}, settingInput: {borderRadius: 6, fontSize: 12, minWidth: 45, paddingHorizontal: 7, paddingVertical: 5, textAlign: 'center'}, resetText: {fontSize: 12, fontWeight: '800', marginLeft: 'auto'}, composer: {alignItems: 'flex-end', flexDirection: 'row', gap: 8, paddingBottom: 8, paddingTop: 10}, input: {borderRadius: 10, flex: 1, fontSize: 15, maxHeight: 110, minHeight: 48, paddingHorizontal: 13, paddingTop: 13}, sendButton: {alignItems: 'center', borderRadius: 9, paddingHorizontal: 16, paddingVertical: 15}, sendText: {fontSize: 13, fontWeight: '800'}, disabled: {opacity: .45}, error: {fontSize: 13, lineHeight: 18, marginTop: 8}, notice: {fontSize: 12, lineHeight: 17, marginTop: 8}})