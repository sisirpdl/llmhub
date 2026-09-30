import {useCallback, useEffect, useState} from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {Alert, AppState, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, useColorScheme, View} from 'react-native'
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context'
import {getBackendDevicesInfo, initLlama, type LlamaContext} from 'llama.rn'
import {SUPPORTED_MODELS, isValidManifest} from './src/models/modelCatalog'
import {artifactPath, deleteModel, downloadModel, downloadVerifiedArtifact, getAvailableSpace, isModelReady, modelPath} from './src/models/modelStore'
import {ChatView, setChatVisionMode} from './src/chat/ChatView'
import {SUPPORTED_VISION_MODELS} from './src/models/visionCatalog'

type ModelState = 'not-downloaded' | 'downloading' | 'validating' | 'ready' | 'loading' | 'active' | 'failed' | 'load-failed'
type Theme = typeof lightTheme
const APP_VERSION = '0.0.1'

function App() {
  const dark = useColorScheme() === 'dark'
  return <SafeAreaProvider><StatusBar barStyle={dark ? 'light-content' : 'dark-content'} /><AppContent /></SafeAreaProvider>
}

function AppContent() {
  const insets = useSafeAreaInsets()
  const dark = useColorScheme() === 'dark'
  const theme = dark ? darkTheme : lightTheme
  const [visionMode, setVisionMode] = useState(false)
  const model = visionMode ? SUPPORTED_VISION_MODELS[0] : SUPPORTED_MODELS[0]
  const [tab, setTab] = useState<'models' | 'chat' | 'diagnostics'>('models')
  const [state, setState] = useState<ModelState>('not-downloaded')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState({bytes: 0, total: model.byteSize})
  const [freeSpace, setFreeSpace] = useState<number | null>(null)
  const [context, setContext] = useState<LlamaContext | null>(null)
  const [loadDuration, setLoadDuration] = useState<number | null>(null)
  const [completionDuration, setCompletionDuration] = useState<number | null>(null)
  const [onboarding, setOnboarding] = useState<boolean | null>(null)
  const [generationActive, setGenerationActive] = useState(false)
  const [engineStatus, setEngineStatus] = useState('checking')

  const refreshStatus = useCallback(async () => {
    setFreeSpace(await getAvailableSpace())
    if (await isModelReady(model)) setState(current => current === 'active' ? current : 'ready')
  }, [model])

  useEffect(() => {
    setChatVisionMode(visionMode)
  }, [visionMode])

  useEffect(() => {
    refreshStatus().catch(() => {})
    getBackendDevicesInfo().then(() => setEngineStatus('available')).catch(() => setEngineStatus('unavailable until model load'))
    AsyncStorage.getItem('@llmhub/onboarding-complete').then(value => setOnboarding(value === 'true')).catch(() => setOnboarding(false))
  }, [refreshStatus])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState !== 'active' && context && !generationActive) {
        context.release().catch(() => {})
        setContext(null)
        setState(current => current === 'active' ? 'ready' : current)
        setMessage('The model was released while the app was in the background. Load it again before chatting.')
      }
    })
    const memorySubscription = AppState.addEventListener('memoryWarning', () => {
      if (!context) return
      context.stopCompletion().catch(() => {}).finally(() => {
        context.release().catch(() => {})
        setContext(null)
        setState('ready')
        setMessage('The model was released to recover memory. Load it again before chatting.')
      })
    })
    return () => { subscription.remove(); memorySubscription.remove() }
  }, [context, generationActive])

  async function handleDownload() {
    if (!isValidManifest(model)) return setMessage('This model manifest is incomplete and cannot be selected.')
    setMessage('')
    setState('downloading')
    try {
      await downloadModel(model, next => setProgress({bytes: next.bytesWritten, total: next.totalBytes}), () => setState('validating'))
        if (visionMode) {
          const visionModel = SUPPORTED_VISION_MODELS[0]
          await downloadVerifiedArtifact(visionModel, next => setProgress({bytes: next.bytesWritten, total: next.totalBytes}))
        }
      setState('ready')
      await refreshStatus()
    } catch (error) {
      setState('failed')
      setMessage(`${error instanceof Error ? error.message : 'Download failed.'} Retrying starts the download from the beginning.`)
    }
  }

  async function handleLoad() {
    setMessage('')
    setState('loading')
    let nextContext: LlamaContext | null = null
    try {
      const loadStartedAt = Date.now()
      nextContext = await initLlama({model: modelPath(model), n_ctx: model.recommendedContextLength})
        if (visionMode && !(await nextContext.initMultimodal({path: artifactPath(SUPPORTED_VISION_MODELS[0].projectorFileName), image_max_tokens: 512}))) throw new Error('Vision projector could not be initialized.')
      setLoadDuration(Date.now() - loadStartedAt)
      const completionStartedAt = Date.now()
      const smokeResult = await nextContext.completion({prompt: 'Reply with exactly: READY', n_predict: 8, temperature: 0})
      setCompletionDuration(Date.now() - completionStartedAt)
      if (!smokeResult.text.trim()) {
        await nextContext.release()
        nextContext = null
        throw new Error('The native smoke completion returned no text.')
      }
      if (context) await context.release()
      setContext(nextContext)
      nextContext = null
      setState('active')
      setMessage('Native smoke completion passed. Ready for Sprint 2 chat.')
    } catch (error) {
      if (nextContext) await nextContext.release().catch(() => {})
      setState('failed')
      setMessage(error instanceof Error ? error.message : 'Model load failed. Check the device profile and retry.')
    }
  }

  function handleDelete() {
    if (generationActive) {
      setMessage('Stop generation before deleting the active model.')
      return
    }
    Alert.alert('Delete downloaded model?', 'The GGUF file will be removed from app storage.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        if (context) await context.release()
        setContext(null)
        await deleteModel(model)
        setState('not-downloaded')
        await refreshStatus()
      }},
    ])
  }

  const percentage = progress.total ? Math.min(100, Math.round(progress.bytes / progress.total * 100)) : 0
  const storage = freeSpace === null ? 'Checking...' : `${(freeSpace / 1024 / 1024 / 1024).toFixed(1)} GB free`
  if (onboarding === null) return <View style={[styles.screen, theme.screen]} />
  if (!onboarding) return <Onboarding theme={theme} onComplete={() => { AsyncStorage.setItem('@llmhub/onboarding-complete', 'true').catch(() => {}); setOnboarding(true) }} />
  return <View style={[styles.screen, theme.screen, {paddingTop: insets.top + 20, paddingBottom: insets.bottom + 12}]}>
    <View style={styles.header}><View><Text style={[styles.kicker, theme.accent]}>LLMHUB / LOCAL RUNTIME</Text><Text style={[styles.title, theme.text]}>Your models.</Text></View><View style={styles.headerActions}><Pressable accessibilityLabel="Switch model type" onPress={() => { if (!context && state !== 'downloading' && state !== 'validating') { setVisionMode(value => !value); setState('not-downloaded'); setMessage('') } }} style={[styles.modePill, theme.secondaryButton]}><Text style={[styles.modeText, theme.secondaryButtonText]}>{visionMode ? 'Vision' : 'Text'}</Text></Pressable><View style={[styles.storagePill, theme.storagePill]}><Text style={[styles.storageText, theme.secondaryText]}>{storage}</Text></View></View></View>
    <View style={[styles.tabs, theme.tabs]}><Tab label="Models" active={tab === 'models'} onPress={() => setTab('models')} theme={theme} /><Tab label="Chat" active={tab === 'chat'} onPress={() => setTab('chat')} theme={theme} /><Tab label="Diagnostics" active={tab === 'diagnostics'} onPress={() => setTab('diagnostics')} theme={theme} /></View>
    {visionMode ? <Text style={[styles.visionNotice, theme.secondaryText]}>Vision preview · SmolVLM uses a separate projector and needs more memory than text mode.</Text> : null}
    {tab === 'models' ? <ScrollView contentContainerStyle={styles.content}><Text style={[styles.sectionLabel, theme.secondaryText]}>SUPPORTED CATALOG / 01</Text><View style={[styles.modelCard, theme.card]}><View style={styles.cardTop}><View style={[styles.modelGlyph, theme.glyph]}><Text style={styles.glyphText}>Q</Text></View><StatusBadge state={state} theme={theme} /></View><Text style={[styles.modelName, theme.text]}>{model.displayName}</Text><Text style={[styles.modelDescription, theme.secondaryText]}>Text-only GGUF · Q4_K_M quantization</Text><View style={styles.metadata}><Meta label="SIZE" value={`${(model.byteSize / 1024 / 1024 / 1024).toFixed(2)} GB`} theme={theme} /><Meta label="CONTEXT" value={`${model.recommendedContextLength} tokens`} theme={theme} /><Meta label="LICENSE" value={model.license} theme={theme} /></View>{state === 'downloading' || state === 'validating' ? <View><View style={[styles.progressTrack, theme.progressTrack]}><View style={[styles.progressBar, {width: `${percentage}%`}]} /></View><Text style={[styles.progressLabel, theme.secondaryText]}>{state === 'validating' ? 'Validating checksum...' : `${progress.bytes.toLocaleString()} / ${progress.total.toLocaleString()} bytes (${percentage}%)`}</Text></View> : null}{message ? <Text style={[styles.message, state === 'active' ? theme.success : theme.error]}>{message}</Text> : null}<View style={styles.actions}>{state === 'not-downloaded' || state === 'failed' ? <ActionButton label={state === 'failed' ? 'Retry download' : 'Download model'} onPress={handleDownload} primary theme={theme} /> : null}{state === 'ready' || state === 'load-failed' ? <ActionButton label={state === 'load-failed' ? 'Retry load' : 'Load model'} onPress={handleLoad} primary theme={theme} /> : null}{state === 'loading' ? <ActionButton label="Loading..." onPress={() => {}} theme={theme} /> : null}{state === 'active' ? <ActionButton label="Active" onPress={() => {}} primary theme={theme} /> : null}{state === 'ready' || state === 'active' || state === 'load-failed' ? <ActionButton label="Delete" onPress={handleDelete} theme={theme} /> : null}</View><Pressable onPress={() => Linking.openURL(model.sourceUrl)}><Text style={[styles.source, theme.accent]}>View source and compatibility notes  ↗</Text></Pressable></View><Text style={[styles.disclaimer, theme.secondaryText]}>Performance and memory use vary by device. Models, prompts, and conversations stay on this device.</Text></ScrollView> : tab === 'chat' ? <ChatView context={context} theme={theme} onGenerationStateChange={setGenerationActive} onBackgroundRelease={async () => { if (context) { await context.release(); setContext(null); setState('ready'); setMessage('The model was released while the app was in the background. Load it again before chatting.') } }} /> : <Diagnostics theme={theme} freeSpace={storage} state={state} loadDuration={loadDuration} completionDuration={completionDuration} engineStatus={engineStatus} />}
  </View>
}

function Tab({label, active, onPress, theme}: {label: string; active: boolean; onPress: () => void; theme: Theme}) { return <Pressable onPress={onPress} style={[styles.tab, active && theme.activeTab]}><Text style={[styles.tabText, theme.secondaryText, active && theme.text]}>{label}</Text></Pressable> }
function StatusBadge({state, theme}: {state: ModelState; theme: Theme}) { const labels: Record<ModelState, string> = {'not-downloaded': 'NOT DOWNLOADED', downloading: 'DOWNLOADING', validating: 'VALIDATING', ready: 'READY', loading: 'LOADING', active: 'ACTIVE', failed: 'FAILED', 'load-failed': 'LOAD FAILED'}; return <View style={[styles.badge, state === 'active' && theme.activeBadge, (state === 'failed' || state === 'load-failed') && theme.failedBadge]}><Text style={[styles.badgeText, theme.badgeText]}>{labels[state]}</Text></View> }
function Meta({label, value, theme}: {label: string; value: string; theme: Theme}) { return <View style={styles.meta}><Text style={[styles.metaLabel, theme.secondaryText]}>{label}</Text><Text style={[styles.metaValue, theme.text]}>{value}</Text></View> }
function ActionButton({label, onPress, primary, theme}: {label: string; onPress: () => void; primary?: boolean; theme: Theme}) { return <Pressable onPress={onPress} style={[styles.button, primary ? theme.primaryButton : theme.secondaryButton]}><Text style={[styles.buttonText, primary ? theme.primaryButtonText : theme.secondaryButtonText]}>{label}</Text></Pressable> }
function Diagnostics({theme, freeSpace, state, loadDuration, completionDuration, engineStatus}: {theme: Theme; freeSpace: string; state: ModelState; loadDuration: number | null; completionDuration: number | null; engineStatus: string}) { const constants = Platform.constants as Record<string, unknown>; const device = String(constants.Model || constants.model || constants.Brand || 'Unknown device'); return <ScrollView contentContainerStyle={styles.content}><Text style={[styles.sectionLabel, theme.secondaryText]}>ENGINE HEALTH / LIVE</Text><View style={[styles.diagnosticCard, theme.card]}><DiagnosticRow label="App version" value={APP_VERSION} theme={theme} /><DiagnosticRow label="Device" value={device} theme={theme} /><DiagnosticRow label="Platform" value={`${Platform.OS} ${String(Platform.Version)}`} theme={theme} /><DiagnosticRow label="llama.rn" value={`0.12.0 · ${engineStatus}`} theme={theme} /><DiagnosticRow label="New Architecture" value="enabled" theme={theme} /><DiagnosticRow label="Model state" value={state} theme={theme} /><DiagnosticRow label="Storage" value={freeSpace} theme={theme} /><DiagnosticRow label="Last load" value={loadDuration === null ? 'Not run' : `${loadDuration} ms`} theme={theme} /><DiagnosticRow label="Last completion" value={completionDuration === null ? 'Not run' : `${completionDuration} ms`} theme={theme} /></View><Text style={[styles.disclaimer, theme.secondaryText]}>Diagnostics never include prompt content. Native load and completion timings stay local to this device.</Text></ScrollView> }
function DiagnosticRow({label, value, theme}: {label: string; value: string; theme: Theme}) { return <View style={styles.diagnosticRow}><Text style={[styles.metaLabel, theme.secondaryText]}>{label}</Text><Text style={[styles.diagnosticValue, theme.text]}>{value}</Text></View> }
function Onboarding({theme, onComplete}: {theme: Theme; onComplete: () => void}) { return <View style={[styles.onboarding, theme.screen]}><Text style={[styles.kicker, theme.accent]}>LLMHUB / PRIVATE BY DEFAULT</Text><Text style={[styles.onboardingTitle, theme.text]}>A local conversation, kept local.</Text><Text style={[styles.onboardingText, theme.secondaryText]}>Models and conversations stay on this device. An internet connection is needed only to download a supported model.</Text><Pressable accessibilityLabel="Continue to model catalog" onPress={onComplete} style={[styles.onboardingButton, theme.primaryButton]}><Text style={[styles.buttonText, theme.primaryButtonText]}>Continue</Text></Pressable></View> }

const styles = StyleSheet.create({
  screen: {flex: 1, paddingHorizontal: 20}, header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, kicker: {fontSize: 11, fontWeight: '800', letterSpacing: 1.4}, title: {fontSize: 34, fontWeight: '800', letterSpacing: .2, marginTop: 6}, storagePill: {borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7}, storageText: {fontSize: 11, fontWeight: '700'}, tabs: {borderRadius: 11, flexDirection: 'row', marginTop: 24, padding: 3}, tab: {alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', paddingVertical: 9}, tabText: {fontSize: 13, fontWeight: '700'}, content: {paddingBottom: 32, paddingTop: 26}, sectionLabel: {fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 11}, modelCard: {borderRadius: 22, padding: 20, shadowColor: '#000000', shadowOffset: {height: 5, width: 0}, shadowOpacity: .06, shadowRadius: 14}, cardTop: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, modelGlyph: {alignItems: 'center', borderRadius: 15, height: 52, justifyContent: 'center', width: 52}, glyphText: {color: '#ffffff', fontSize: 25, fontWeight: '900'}, badge: {borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6}, badgeText: {fontSize: 9, fontWeight: '800', letterSpacing: .7}, modelName: {fontSize: 24, fontWeight: '800', marginTop: 19}, modelDescription: {fontSize: 14, marginTop: 5}, metadata: {borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 23, paddingTop: 15}, meta: {flex: 1}, metaLabel: {fontSize: 10, fontWeight: '800', letterSpacing: .7}, metaValue: {fontSize: 13, fontWeight: '700', marginTop: 5}, progressTrack: {borderRadius: 4, height: 7, marginTop: 22, overflow: 'hidden'}, progressBar: {backgroundColor: '#34c759', height: '100%'}, progressLabel: {fontSize: 12, marginTop: 8}, message: {fontSize: 13, lineHeight: 19, marginTop: 16}, actions: {flexDirection: 'row', gap: 9, marginTop: 22}, button: {alignItems: 'center', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 13}, buttonText: {fontSize: 14, fontWeight: '700'}, source: {fontSize: 13, fontWeight: '700', marginTop: 20}, disclaimer: {fontSize: 13, lineHeight: 20, marginTop: 18}, diagnosticCard: {borderRadius: 18, paddingHorizontal: 17, shadowColor: '#000000', shadowOffset: {height: 3, width: 0}, shadowOpacity: .04, shadowRadius: 10}, diagnosticRow: {borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 15}, diagnosticValue: {fontSize: 16, fontWeight: '700', marginTop: 5}, onboarding: {justifyContent: 'center'}, onboardingTitle: {fontSize: 37, fontWeight: '800', lineHeight: 43, marginTop: 18, maxWidth: 340}, onboardingText: {fontSize: 17, lineHeight: 26, marginTop: 18, maxWidth: 360}, onboardingButton: {alignItems: 'center', alignSelf: 'flex-start', borderRadius: 12, marginTop: 30, paddingHorizontal: 24, paddingVertical: 15}, activeTab: {backgroundColor: '#ffffff'}, activeBadge: {backgroundColor: '#dff7e5'}, failedBadge: {backgroundColor: '#ffe5e2'},
  headerActions: {alignItems: 'center', flexDirection: 'row', gap: 6}, modePill: {borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7}, modeText: {fontSize: 11, fontWeight: '700'}, visionNotice: {fontSize: 13, lineHeight: 19, marginTop: 14},
})
const lightTheme = StyleSheet.create({screen: {backgroundColor: '#f2f2f7'}, card: {backgroundColor: '#ffffff'}, tabs: {backgroundColor: '#e5e5ea'}, text: {color: '#111111'}, secondaryText: {color: '#6e6e73'}, accent: {color: '#007aff'}, glyph: {backgroundColor: '#007aff'}, storagePill: {backgroundColor: '#e5f1ff'}, primaryButton: {backgroundColor: '#007aff'}, primaryButtonText: {color: '#ffffff'}, secondaryButton: {backgroundColor: '#e5e5ea'}, secondaryButtonText: {color: '#1c1c1e'}, progressTrack: {backgroundColor: '#d1d1d6'}, badgeText: {color: '#248a3d'}, success: {color: '#248a3d'}, error: {color: '#d70015'}, activeTab: {backgroundColor: '#ffffff'}, activeBadge: {backgroundColor: '#dff7e5'}, failedBadge: {backgroundColor: '#ffe5e2'}})
const darkTheme = StyleSheet.create({screen: {backgroundColor: '#000000'}, card: {backgroundColor: '#1c1c1e'}, tabs: {backgroundColor: '#2c2c2e'}, text: {color: '#f2f2f7'}, secondaryText: {color: '#98989d'}, accent: {color: '#0a84ff'}, glyph: {backgroundColor: '#0a84ff'}, storagePill: {backgroundColor: '#153452'}, primaryButton: {backgroundColor: '#0a84ff'}, primaryButtonText: {color: '#ffffff'}, secondaryButton: {backgroundColor: '#2c2c2e'}, secondaryButtonText: {color: '#f2f2f7'}, progressTrack: {backgroundColor: '#48484a'}, badgeText: {color: '#30d158'}, success: {color: '#30d158'}, error: {color: '#ff453a'}, activeTab: {backgroundColor: '#3a3a3c'}, activeBadge: {backgroundColor: '#1c4a2a'}, failedBadge: {backgroundColor: '#5a1d1d'}})

export default App