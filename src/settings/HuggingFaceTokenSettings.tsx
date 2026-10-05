import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, IconButton } from '../ui/Controls';
import type { Colors } from '../ui/theme';
export function HuggingFaceTokenSettings({
  token,
  onApply,
  colors,
}: {
  token: string;
  onApply: (value: string) => void;
  colors: Colors;
}) {
  const [draft, setDraft] = useState(token);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  function apply() {
    const value = draft.trim();
    if (!/^hf_[A-Za-z0-9]+$/.test(value) || value.length > 512) {
      setError('Enter a Hugging Face token beginning with hf_.');
      return;
    }
    onApply(value);
    setDraft(value);
    setVisible(false);
    setError('');
  }
  return (
    <View
      style={[
        styles.group,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.description, { color: colors.muted }]}>
        Optional read token for private or gated models and authenticated
        downloads. Your account must also have access to the model.
      </Text>
      <View
        style={[
          styles.inputRow,
          { borderColor: colors.border, backgroundColor: colors.input },
        ]}
      >
        <TextInput
          accessibilityLabel="Hugging Face token"
          placeholder="hf_…"
          placeholderTextColor={colors.muted}
          value={draft}
          onChangeText={value => {
            setDraft(value);
            setError('');
          }}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          maxLength={512}
          style={[styles.input, { color: colors.text }]}
        />
        <IconButton
          name={visible ? 'eyeOff' : 'eye'}
          label={visible ? 'Hide token' : 'Show token'}
          colors={colors}
          onPress={() => setVisible(value => !value)}
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.description,
          { color: token ? colors.green : colors.muted },
        ]}
      >
        {token ? 'Token active for this session.' : 'No token configured.'}{' '}
        Token is kept in memory and cleared when the app restarts.
      </Text>
      <Button
        label="Apply token"
        colors={colors}
        disabled={!draft.trim() || draft.trim() === token}
        onPress={apply}
      />
      {token || draft ? (
        <Button
          label="Remove token"
          colors={colors}
          onPress={() => {
            onApply('');
            setDraft('');
            setVisible(false);
            setError('');
          }}
        />
      ) : null}
      <Button
        label="Get a Hugging Face token"
        icon="external"
        colors={colors}
        onPress={() => {
          Linking.openURL('https://huggingface.co/settings/tokens').catch(() =>
            setError(
              'Unable to open Hugging Face. Visit huggingface.co/settings/tokens in your browser.',
            ),
          );
        }}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  description: { fontSize: 13, lineHeight: 19 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
});
