import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { exportChat, importChatFile } from '../chat/chatTransfer';
import { removeChatImages } from '../chat/attachments';
import {
  useModelSettings,
  validateSettings,
  type ModelSettings,
} from '../settings/modelSettings';
import type { ModelManifest } from '../models/modelCatalog';
import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { useModelController, isVision } from './useModelController';
import { useChatController } from '../chat/useChatController';
import { darkColors, lightColors, type Appearance } from '../ui/theme';
import { useNearbyTransfer } from '../nearby/useNearbyTransfer';
import { useLan } from '../lan/useLan';
import { useDocumentIndex } from '../documents/useDocumentIndex';
export type Route = 'chat' | 'models' | 'settings';
export function useAppController() {
  const systemDark = useColorScheme() === 'dark';
  const [appearance, setAppearance] = useState<Appearance>('dark');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [onboarding, setOnboarding] = useState<boolean | null>(null);
  const [route, setRoute] = useState<Route>('models');
  const [discoveryVisible, setDiscoveryVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [chatSettingsVisible, setChatSettingsVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [documentsVisible, setDocumentsVisible] = useState(false);
  const [issueReportVisible, setIssueReportVisible] = useState(false);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);
  const [transfer, setTransfer] = useState<'import' | 'export' | null>(null);
  const transferBusy = useRef(false);
  const settings = useModelSettings();
  const documents = useDocumentIndex();
  const [renameVisible, setRenameVisible] = useState(false);
  const [visionSetupVisible, setVisionSetupVisible] = useState(false);
  const models = useModelController({
    contextLengthFor: model => settings.forModel(model).contextLength,
  });
  const { setNotice, setGenerationActive } = models;
  useEffect(() => {
    if (settings.error) setNotice(settings.error);
  }, [settings.error, setNotice]);
  const lan = useLan({
    context: models.context,
    model: models.model,
    settings: settings.forModel(models.model),
    contextLength: models.loadedContextLength,
    generationActive: models.generationActive,
    setNotice,
  });
  const chatModel = lan.remote?.model || models.model;
  const chat = useChatController({
    context: lan.host ? null : lan.remote?.context || models.context,
    model: chatModel,
    vision: !lan.remote && isVision(models.model),
    settings: lan.remote
      ? {
          ...settings.forModel(models.model),
          maxTokens: Math.min(
            settings.forModel(models.model).maxTokens,
            Math.floor(lan.remote.contextLength / 2),
          ),
        }
      : settings.forModel(models.model),
    contextLength: lan.remote?.contextLength || models.loadedContextLength,
    onImagePickerStateChange: models.setExternalUIActive,
    retrieve: documents.retrieve,
  });
  const nearby = useNearbyTransfer(models);
  useEffect(() => {
    setGenerationActive(
      nearby.busy ||
        nearby.working ||
        chat.sending ||
        Boolean(lan.host) ||
        lan.serving,
    );
  }, [
    nearby.busy,
    nearby.working,
    chat.sending,
    lan.host,
    lan.serving,
    setGenerationActive,
  ]);
  useEffect(() => {
    AsyncStorage.getItem('@llmhub/onboarding-complete')
      .then(value => setOnboarding(value === 'true'))
      .catch(() => setOnboarding(false));
    AsyncStorage.getItem('@llmhub/appearance')
      .then(value => {
        if (value === 'light' || value === 'system' || value === 'dark')
          setAppearance(value);
        setPreferencesLoaded(true);
      })
      .catch(() => setPreferencesLoaded(true));
  }, []);
  useEffect(() => {
    if (preferencesLoaded)
      AsyncStorage.setItem('@llmhub/appearance', appearance).catch(() =>
        setNotice('Appearance could not be saved.'),
      );
  }, [appearance, preferencesLoaded, setNotice]);
  const dark = appearance === 'dark' || (appearance === 'system' && systemDark);
  function completeOnboarding() {
    AsyncStorage.setItem('@llmhub/onboarding-complete', 'true').catch(() =>
      models.setNotice('Onboarding preference could not be saved.'),
    );
    setOnboarding(true);
  }
  async function applyModelSettings(
    value: ModelSettings,
    systemPrompt: string,
  ) {
    if (lan.host || lan.remote)
      throw new Error(
        'Disconnect LAN mode before changing local model settings.',
      );
    if (chat.sending)
      throw new Error('Stop generation before applying settings.');
    const invalid = validateSettings(value);
    if (invalid) throw new Error(invalid);
    if (!settings.loaded)
      throw new Error('Wait for saved settings to finish loading.');
    const previousContext = models.loadedContextLength;
    if (
      models.context &&
      models.loadedContextLength !== value.contextLength &&
      !(await models.load(models.model, value.contextLength))
    )
      throw new Error(
        'The model could not reload with this context length. Your conversation was kept.',
      );
    try {
      await settings.save(models.model, value);
    } catch (error) {
      if (previousContext !== null && previousContext !== value.contextLength)
        await models.load(models.model, previousContext);
      throw error;
    }
    chat.setSystemPrompt(systemPrompt);
  }
  async function switchModel(model: ModelManifest): Promise<boolean> {
    if (chat.sending || lan.host || lan.remote || lan.pending) return false;
    if (!isVision(model) && (chat.hasImageHistory || chat.imageUri)) {
      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          'Switch to a text model?',
          'Messages and saved images stay in this chat. This model will only receive their text. Remove any pending image before sending.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Switch model', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        ),
      );
      if (!confirmed) return false;
    }
    return models.load(model);
  }
  async function transferChat(kind: 'import' | 'export') {
    if (transferBusy.current || chat.sending || !chat.loaded) return;
    transferBusy.current = true;
    setTransfer(kind);
    models.setExternalUIActive(true);
    let importedImages: string[] = [];
    try {
      if (kind === 'export') {
        const saved = await exportChat(chat.exportDocument(), chat.title);
        if (saved)
          models.setNotice(
            'Chat exported as JSON. Keep it private; it includes messages and attached images.',
          );
      } else {
        const result = await importChatFile();
        if (!result) return;
        importedImages = result.images;
        await chat.importDocument(result.document);
        importedImages = [];
        setHistoryVisible(false);
        setRoute('chat');
        models.setNotice(
          `Chat imported · ${result.document.model}. Importing does not download or load a model; choose an installed model to continue.`,
        );
      }
    } catch (e) {
      await removeChatImages(importedImages);
      models.setNotice(
        e instanceof Error ? e.message : `Unable to ${kind} this chat.`,
      );
    } finally {
      transferBusy.current = false;
      setTransfer(null);
      models.setExternalUIActive(false);
    }
  }
  function openChatMenu() {
    if (chat.sending || !chat.loaded || transferBusy.current) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Export chat', 'Ask your docs'],
          cancelButtonIndex: 0,
        },
        index => {
          if (index === 1) transferChat('export');
          if (index === 2) setDocumentsVisible(true);
        },
      );
    } else setChatMenuVisible(true);
  }
  function requestImageAttachment() {
    if (chat.sending || transferBusy.current) return;
    if (lan.remote || lan.host) {
      setNotice(
        'LAN mode supports text chat only. Disconnect to use a local vision model.',
      );
      return;
    }
    const choose = (source: 'camera' | 'gallery') => {
      if (models.context && isVision(models.model)) chat.attachImage(source);
      else setVisionSetupVisible(true);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Camera', 'Gallery'], cancelButtonIndex: 0 },
        index => {
          if (index === 1) choose('camera');
          if (index === 2) choose('gallery');
        },
      );
    } else {
      Alert.alert('Add image', 'Choose where to get your image.', [
        { text: 'Camera', onPress: () => choose('camera') },
        { text: 'Gallery', onPress: () => choose('gallery') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }
  return {
    issueReportVisible,
    setIssueReportVisible,
    nearby,
    lan,
    chatModel,
    transfer,
    importChat: () => transferChat('import'),
    exportChat: () => transferChat('export'),
    openChatMenu,
    chatMenuVisible,
    setChatMenuVisible,
    requestImageAttachment,
    visionSetupVisible,
    setVisionSetupVisible,
    settings,
    applyModelSettings,
    switchModel,
    renameVisible,
    setRenameVisible,
    models,
    chat,
    route,
    setRoute,
    appearance,
    setAppearance,
    dark,
    colors: dark ? darkColors : lightColors,
    onboarding,
    completeOnboarding,
    discoveryVisible,
    setDiscoveryVisible,
    pickerVisible,
    setPickerVisible,
    chatSettingsVisible,
    setChatSettingsVisible,
    historyVisible,
    setHistoryVisible,
    documentsVisible,
    setDocumentsVisible,
    documents,
  };
}
export type AppController = ReturnType<typeof useAppController>;
