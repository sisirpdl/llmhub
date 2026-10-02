import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ModelManifest } from './modelCatalog';
import { isVision, type ModelController } from '../app/useModelController';
import { Button } from '../ui/Controls';
import { formatBytes, type Colors } from '../ui/theme';

export function ModelSuggestion({
  model,
  controller,
  colors,
  onBrowse,
  onStarted,
}: {
  model: ModelManifest;
  controller: ModelController;
  colors: Colors;
  onBrowse: () => void;
  onStarted?: () => void;
}) {
  const vision = isVision(model);
  const size = model.byteSize + (vision ? model.projectorByteSize : 0);
  const shortfall =
    controller.freeSpace === null
      ? null
      : Math.max(0, size + 256 * 1024 ** 2 - controller.freeSpace);
  const state = controller.states[model.id] || 'checking';
  const busy =
    controller.generationActive ||
    controller.importing ||
    Object.values(controller.states).some(value =>
      ['checking', 'loading', 'downloading', 'validating'].includes(value),
    );
  return (
    <View
      style={[
        s.card,
        { backgroundColor: colors.elevated, borderColor: colors.border },
        Platform.OS === 'ios' && s.iosCard,
      ]}
    >
      <Text style={[s.title, { color: colors.text }]}>
        {vision ? 'Add image understanding' : 'Get started with text chat'}
      </Text>
      <Text style={{ color: colors.text }}>{model.displayName}</Text>
      <Text style={[s.hint, { color: colors.muted }]}>
        {formatBytes(size)} download
        {vision ? ' · Includes vision projector' : ' · Runs on device'}
      </Text>
      <Text style={[s.hint, { color: colors.muted }]}>
        Performance depends on your device. {model.testedDeviceProfile}
      </Text>
      {shortfall !== null && shortfall > 0 ? (
        <Text style={[s.hint, { color: colors.danger }]}>
          Needs {formatBytes(shortfall)} more storage.
        </Text>
      ) : null}
      {controller.errors[model.id] ? (
        <Text style={[s.hint, { color: colors.danger }]}>
          {controller.errors[model.id]}
        </Text>
      ) : null}
      <View style={s.actions}>
        <View style={s.action}>
          <Button
            colors={colors}
            label={state === 'failed' ? 'Retry download' : 'Download'}
            icon="download"
            disabled={busy || Boolean(shortfall)}
            onPress={() => {
              controller.download(model);
              onStarted?.();
            }}
          />
        </View>
        <View style={s.action}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find another model"
            onPress={onBrowse}
            style={s.browse}
          >
            <Text style={{ color: colors.accent }}>Find another</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 8,
    marginTop: 12,
    marginBottom: 12,
  },
  iosCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: { flex: 1 },
  browse: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
});
