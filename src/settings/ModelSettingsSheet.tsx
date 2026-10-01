import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ModelManifest } from '../models/modelCatalog';
import type { Colors } from '../ui/theme';
import { Button, Sheet } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import {
  defaultsFor,
  DEFAULT_SYSTEM_PROMPT,
  validateSettings,
  type ModelSettings,
} from './modelSettings';
const fields: {
  key: keyof ModelSettings;
  label: string;
  hint: string;
  integer?: boolean;
}[] = [
  {
    key: 'temperature',
    label: 'Temperature',
    hint: '0–2 · Lower values are more focused.',
  },
  {
    key: 'maxTokens',
    label: 'Maximum output tokens',
    hint: 'Maximum response length; must fit within the context.',
    integer: true,
  },
  {
    key: 'topP',
    label: 'Top-p',
    hint: '0–1 · Limits selection by cumulative token probability.',
  },
  {
    key: 'topK',
    label: 'Top-k',
    hint: '0–1000 · Limits candidate tokens; 0 disables the limit.',
    integer: true,
  },
  {
    key: 'minP',
    label: 'Min-p',
    hint: '0–1 · Removes tokens unlikely relative to the best candidate.',
  },
  {
    key: 'repeatPenalty',
    label: 'Repetition penalty',
    hint: '0.5–2 · 1 disables the penalty; higher values discourage repetition.',
  },
  {
    key: 'seed',
    label: 'Seed',
    hint: '-1 chooses a random seed. A fixed seed helps compare settings.',
    integer: true,
  },
  {
    key: 'contextLength',
    label: 'Context length',
    hint: '512–8192 · Includes the prompt and response. Changing this reloads the model and increases RAM use.',
    integer: true,
  },
];
export function ModelSettingsSheet({
  visible,
  onClose,
  model,
  settings,
  systemPrompt,
  onApply,
  colors,
  disabled,
}: {
  visible: boolean;
  onClose: () => void;
  model: ModelManifest;
  settings: ModelSettings;
  systemPrompt: string;
  onApply: (settings: ModelSettings, prompt: string) => Promise<void>;
  colors: Colors;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const defaults = defaultsFor(model);
  useEffect(() => {
    if (visible) {
      setDraft(
        Object.fromEntries(
          Object.entries(settings).map(([k, v]) => [k, String(v)]),
        ),
      );
      setPrompt(systemPrompt);
      setError('');
    }
  }, [visible, settings, systemPrompt]);
  const renderField = (field: (typeof fields)[number]) => (
    <View key={field.key} style={s.field}>
      <View style={s.row}>
        <Text style={[s.label, { color: colors.text }]}>{field.label}</Text>
        <Text style={[s.default, { color: colors.muted }]}>
          Default: {defaults[field.key]}
        </Text>
      </View>
      <Text style={[s.hint, { color: colors.muted }]}>{field.hint}</Text>
      <TextInput
        accessibilityLabel={field.label}
        keyboardType={field.integer ? 'numbers-and-punctuation' : 'decimal-pad'}
        value={draft[field.key] || ''}
        onChangeText={value =>
          setDraft(current => ({ ...current, [field.key]: value }))
        }
        style={[s.input, { color: colors.text, backgroundColor: colors.input }]}
      />
    </View>
  );
  return (
    <Sheet
      visible={visible}
      title="Model settings"
      onClose={() => {
        if (!applying) onClose();
      }}
      colors={colors}
    >
      <Text style={[s.model, { color: colors.text }]}>{model.displayName}</Text>
      <Text style={[s.hint, { color: colors.muted }]}>
        Saved for this model across chats. App defaults may differ from the
        model author’s recommendations. Changes apply to your next response.
      </Text>
      {fields.slice(0, 2).map(renderField)}
      <View style={s.field}>
        <View style={s.row}>
          <Text style={[s.label, { color: colors.text }]}>
            System instruction
          </Text>
          <Text style={[s.default, { color: colors.muted }]}>This chat</Text>
        </View>
        <TextInput
          accessibilityLabel="System instruction"
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={2000}
          style={[
            s.input,
            s.prompt,
            { backgroundColor: colors.input, color: colors.text },
          ]}
        />
        <Text style={[s.hint, { color: colors.muted }]}>
          Default: {DEFAULT_SYSTEM_PROMPT}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle advanced model settings"
        accessibilityState={{ expanded: advanced }}
        onPress={() => setAdvanced(v => !v)}
        style={s.row}
      >
        <Text style={[s.label, { color: colors.accent }]}>Advanced</Text>
        <Icon name={advanced ? 'up' : 'down'} color={colors.accent} />
      </Pressable>
      {advanced ? fields.slice(2).map(renderField) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reset model settings to defaults"
        disabled={applying}
        onPress={() => {
          setDraft(
            Object.fromEntries(
              Object.entries(defaults).map(([k, v]) => [k, String(v)]),
            ),
          );
          setPrompt(DEFAULT_SYSTEM_PROMPT);
          setError('');
        }}
        style={s.reset}
      >
        <Text style={{ color: colors.accent }}>Reset to defaults</Text>
      </Pressable>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <View style={s.actions}>
        <View style={s.grow}>
          <Button
            label="Cancel"
            colors={colors}
            disabled={applying}
            onPress={onClose}
          />
        </View>
        <View style={s.grow}>
          <Button
            label={applying ? 'Applying…' : 'Apply'}
            colors={colors}
            disabled={disabled || applying}
            onPress={async () => {
              const value = Object.fromEntries(
                Object.entries(draft).map(([k, v]) => [
                  k,
                  v.trim() === '' ? NaN : Number(v),
                ]),
              ) as ModelSettings;
              const invalid = validateSettings(value);
              if (invalid) {
                setError(invalid);
                return;
              }
              setApplying(true);
              setError('');
              try {
                await onApply(value, prompt);
                onClose();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : 'Unable to apply settings.',
                );
              } finally {
                setApplying(false);
              }
            }}
          />
        </View>
      </View>
    </Sheet>
  );
}
const s = StyleSheet.create({
  model: { fontSize: 18, fontWeight: '600' },
  field: { gap: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: { fontSize: 16, fontWeight: '500', flexShrink: 1 },
  default: { fontSize: 12 },
  hint: { fontSize: 13, lineHeight: 19 },
  input: { padding: 14, borderRadius: 12, fontSize: 16, minHeight: 48 },
  prompt: { minHeight: 100, textAlignVertical: 'top' },
  reset: { paddingVertical: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  grow: { flex: 1 },
});
