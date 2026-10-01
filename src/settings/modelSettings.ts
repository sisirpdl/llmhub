import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ModelManifest } from '../models/modelCatalog';
export type ModelSettings = {
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
  minP: number;
  repeatPenalty: number;
  seed: number;
  contextLength: number;
};
export const DEFAULT_SYSTEM_PROMPT = 'You are a helpful assistant.';
export const defaultsFor = (model: ModelManifest): ModelSettings => ({
  temperature: 0.7,
  maxTokens: 256,
  topP: 0.95,
  topK: 40,
  minP: 0.05,
  repeatPenalty: 1,
  seed: -1,
  contextLength: model.recommendedContextLength,
});
export function validateSettings(settings: ModelSettings): string | null {
  const range = (value: number, min: number, max: number) =>
    Number.isFinite(value) && value >= min && value <= max;
  if (!range(settings.temperature, 0, 2))
    return 'Temperature must be between 0 and 2.';
  if (
    !Number.isInteger(settings.contextLength) ||
    !range(settings.contextLength, 512, 8192)
  )
    return 'Context length must be 512–8192 tokens.';
  if (
    !Number.isInteger(settings.maxTokens) ||
    !range(settings.maxTokens, 1, Math.min(4096, settings.contextLength - 128))
  )
    return 'Output tokens must leave at least 128 tokens for the prompt within the context window.';
  if (!range(settings.topP, 0, 1) || !range(settings.minP, 0, 1))
    return 'Top-p and min-p must be between 0 and 1.';
  if (!Number.isInteger(settings.topK) || !range(settings.topK, 0, 1000))
    return 'Top-k must be an integer between 0 and 1000.';
  if (!range(settings.repeatPenalty, 0.5, 2))
    return 'Repetition penalty must be between 0.5 and 2.';
  if (!Number.isInteger(settings.seed) || !range(settings.seed, -1, 2147483647))
    return 'Seed must be -1 (random) or a positive integer up to 2147483647.';
  return null;
}
const KEY = '@llmhub/model-settings-v1';
export function useModelSettings() {
  const [legacy, setLegacy] = useState<Partial<ModelSettings>>({});
  const [values, setValues] = useState<Record<string, ModelSettings>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    AsyncStorage.getItem(KEY)
      .then(async value => {
        if (disposed) return;
        if (value) {
          const parsed = JSON.parse(value);
          if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed) ||
            Object.values(parsed).some(s =>
              validateSettings(s as ModelSettings),
            )
          )
            throw new Error('Invalid settings');
          setValues(parsed);
        }
        if (!value) {
          const previous = await AsyncStorage.getItem('@llmhub/chat-settings');
          if (previous) {
            try {
              const parsed = JSON.parse(previous);
              const migrated = {
                temperature: Number(parsed.temperature ?? 0.7),
                maxTokens: Number(parsed.maxTokens ?? 256),
              };
              if (
                Number.isFinite(migrated.temperature) &&
                migrated.temperature >= 0 &&
                migrated.temperature <= 2 &&
                Number.isInteger(migrated.maxTokens) &&
                migrated.maxTokens >= 1 &&
                migrated.maxTokens <= 4096 &&
                !disposed
              )
                setLegacy(migrated);
            } catch {
              /* Keep app defaults for malformed legacy settings. */
            }
          }
        }
        if (disposed) return;
        setLoaded(true);
      })
      .catch(() => {
        if (!disposed)
          setError(
            'Saved model settings could not be restored. Restart to retry.',
          );
      });
    return () => {
      disposed = true;
    };
  }, []);
  const defaultCache = useRef(new Map<string, ModelSettings>());
  const forModel = useCallback(
    (model: ModelManifest) => {
      if (values[model.id]) return values[model.id];
      const key = `${model.id}:${model.recommendedContextLength}:${legacy.temperature}:${legacy.maxTokens}`;
      let result = defaultCache.current.get(key);
      if (!result) {
        result = {
          ...defaultsFor(model),
          ...legacy,
          maxTokens: Math.min(
            legacy.maxTokens || 256,
            model.recommendedContextLength - 128,
          ),
        };
        defaultCache.current.set(key, result);
      }
      return result;
    },
    [values, legacy],
  );
  async function save(model: ModelManifest, settings: ModelSettings) {
    if (!loaded) throw new Error('Wait for saved settings to finish loading.');
    const invalid = validateSettings(settings);
    if (invalid) throw new Error(invalid);
    const next = { ...values, [model.id]: settings };
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    setValues(next);
  }
  return { forModel, save, loaded, error };
}
