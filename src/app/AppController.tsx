import { Alert } from 'react-native';
import {
  useModelSettings,
  validateSettings,
  type ModelSettings,
} from '../settings/modelSettings';
import type { ModelManifest } from '../models/modelCatalog';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { useModelController, isVision } from './useModelController';
import { useChatController } from '../chat/useChatController';
import { darkColors, lightColors, type Appearance } from '../ui/theme';
export type Route = 'chat' | 'models' | 'settings' | 'info';
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
  const settings = useModelSettings();
  const [renameVisible, setRenameVisible] = useState(false);
  const models = useModelController({
    contextLengthFor: model => settings.forModel(model).contextLength,
  });
  const { setNotice } = models;
  useEffect(() => {
    if (settings.error) setNotice(settings.error);
  }, [settings.error, setNotice]);
  const chat = useChatController({
    context: models.context,
    model: models.model,
    vision: isVision(models.model),
    onGenerationStateChange: models.setGenerationActive,
    settings: settings.forModel(models.model),
    contextLength: models.loadedContextLength,
    onImagePickerStateChange: models.setExternalUIActive,
  });
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
    if (chat.sending) return false;
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
  return {
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
  };
}
export type AppController = ReturnType<typeof useAppController>;
