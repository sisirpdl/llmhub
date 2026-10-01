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
  const models = useModelController();
  const { setNotice } = models;
  const chat = useChatController({
    context: models.context,
    model: models.model,
    vision: isVision(models.model),
    onGenerationStateChange: models.setGenerationActive,
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
  return {
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
