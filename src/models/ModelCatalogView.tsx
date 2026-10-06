import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  isVision,
  type ModelController,
  type ModelState,
} from '../app/useModelController';
import { isImported } from './importedModels';
import { quantization } from './huggingFace';
import { SUPPORTED_MODELS } from './modelCatalog';
import { ModelSuggestion } from './ModelSuggestion';
import type { ModelManifest } from './modelCatalog';
import { Button, IconButton, Sheet } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { formatBytes, type Colors } from '../ui/theme';
const labels: Record<ModelState, string> = {
  checking: 'Checking files',
  'not-downloaded': 'Not downloaded',
  downloading: 'Downloading',
  validating: 'Verifying checksum',
  ready: 'Ready to load',
  loading: 'Loading',
  active: 'Loaded',
  failed: 'Download failed',
  'load-failed': 'Load failed',
};
const downloaded = (state: ModelState) =>
  ['ready', 'active', 'loading', 'load-failed'].includes(state);
export function ModelCard({
  model,
  controller,
  colors,
  onChat,
  onShare,
}: {
  model: ModelManifest;
  controller: ModelController;
  colors: Colors;
  onChat: () => void;
  onShare?: (model: ModelManifest) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const state = controller.states[model.id] || 'checking';
  const p = controller.progress[model.id];
  const percentage = p?.total
    ? Math.min(100, Math.round((p.bytes / p.total) * 100))
    : 0;
  const working = ['checking', 'downloading', 'validating', 'loading'].includes(
    state,
  );
  const anyWorking =
    controller.importing ||
    Object.values(controller.states).some(value =>
      ['downloading', 'validating', 'loading'].includes(value),
    );
  const label =
    state === 'active'
      ? 'Offload'
      : downloaded(state)
      ? state === 'load-failed'
        ? 'Retry load'
        : 'Load'
      : state === 'failed'
      ? 'Retry download'
      : 'Download';
  const action = () => {
    if (state === 'active') {
      controller.offload();
      return;
    }
    if (downloaded(state)) {
      controller.load(model);
      return;
    }
    if (isImported(model) && ['local', 'nearby'].includes(model.origin)) {
      controller.setNotice(
        model.origin === 'nearby'
          ? 'The received model is missing. Receive it again or add its local GGUF file.'
          : 'The local file is missing. Add it again using Add local model.',
      );
      return;
    }
    controller.download(model);
  };
  const error = controller.errors[model.id];
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        Platform.OS === 'ios' && styles.iosCard,
      ]}
    >
      <View style={styles.cardHeading}>
        <Icon
          name={isVision(model) ? 'image' : 'chat'}
          color={colors.accent}
          size={20}
        />
        <Text numberOfLines={2} style={[styles.name, { color: colors.text }]}>
          {model.displayName}
        </Text>
        <Text style={[styles.size, { color: colors.muted }]}>
          {model.byteSize ? formatBytes(model.byteSize) : 'Unknown size'}
        </Text>
        <View
          accessibilityLabel={labels[state]}
          style={[
            styles.dot,
            {
              backgroundColor:
                state === 'active'
                  ? colors.active
                  : state === 'ready'
                  ? colors.accent
                  : colors.muted,
            },
          ]}
        />
      </View>
      <View style={styles.actions}>
        <View style={styles.mainAction}>
          {working ? (
            <View
              style={[styles.working, { backgroundColor: colors.elevated }]}
            >
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={{ color: colors.muted }}>
                {labels[state]}
                {state === 'downloading'
                  ? p?.total
                    ? ` · ${percentage}%`
                    : '…'
                  : '…'}
              </Text>
            </View>
          ) : (
            <Button
              label={label}
              icon={
                state === 'active'
                  ? 'offload'
                  : downloaded(state)
                  ? 'download'
                  : 'download'
              }
              green={state === 'active'}
              colors={colors}
              disabled={controller.generationActive || anyWorking}
              onPress={action}
            />
          )}
        </View>
        {state === 'active' ? (
          <IconButton
            name="chat"
            label={`Chat with ${model.displayName}`}
            colors={colors}
            color={colors.accent}
            onPress={onChat}
          />
        ) : null}
        {onShare && ['ready', 'active', 'load-failed'].includes(state) ? (
          <IconButton
            name="send"
            label={`Share ${model.displayName} nearby`}
            colors={colors}
            disabled={controller.generationActive || anyWorking}
            onPress={() => onShare(model)}
          />
        ) : null}
        {downloaded(state) || isImported(model) ? (
          <IconButton
            name="trash"
            label={`Delete ${model.displayName}`}
            colors={colors}
            color={colors.danger}
            disabled={working || controller.generationActive || anyWorking}
            onPress={() => controller.remove(model)}
          />
        ) : null}
        <IconButton
          name={expanded ? 'up' : 'down'}
          label={`${expanded ? 'Hide' : 'Show'} details for ${
            model.displayName
          }`}
          colors={colors}
          onPress={() => setExpanded(value => !value)}
        />
      </View>
      {state === 'downloading' || state === 'validating' ? (
        <View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: percentage }}
            style={[styles.track, { backgroundColor: colors.border }]}
          >
            <View
              style={[
                styles.progress,
                { backgroundColor: colors.accent, width: `${percentage}%` },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>
            {p
              ? `${formatBytes(p.bytes)}${
                  p.total ? ' / ' + formatBytes(p.total) : ''
                }`
              : 'Preparing download…'}{' '}
            · {labels[state]}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.error, { color: colors.danger }]}
        >
          {error}
        </Text>
      ) : null}
      {expanded ? (
        <View style={[styles.details, { borderColor: colors.border }]}>
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {labels[state]} · {isVision(model) ? 'Vision' : 'Text'} ·{' '}
            {isImported(model)
              ? quantization(model.originalFileName)
              : 'Q4_K_M'}
          </Text>
          <View style={styles.detailRow}>
            <Text style={{ color: colors.muted }}>Context</Text>
            <Text style={{ color: colors.text }}>
              {model.recommendedContextLength} tokens
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={{ color: colors.muted }}>License</Text>
            <Text style={{ color: colors.text }}>{model.license}</Text>
          </View>
          {isVision(model) ? (
            <Text style={[styles.detailText, { color: colors.muted }]}>
              Includes a {formatBytes(model.projectorByteSize)} vision
              projector.
            </Text>
          ) : null}
          <Text style={[styles.detailText, { color: colors.muted }]}>
            {model.testedDeviceProfile}
          </Text>
          {model.sourceUrl ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`View source for ${model.displayName}`}
              onPress={() =>
                Linking.openURL(model.sourceUrl).catch(() =>
                  controller.setNotice('Unable to open the source link.'),
                )
              }
              style={styles.source}
            >
              <Text style={{ color: colors.accent }}>
                Source & compatibility
              </Text>
              <Icon name="external" color={colors.accent} size={16} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
export function ModelCatalogView({
  controller,
  colors,
  onDiscover,
  onChat,
  onShare,
  onReceive,
}: {
  controller: ModelController;
  colors: Colors;
  onDiscover: () => void;
  onShare?: (model: ModelManifest) => void;
  onReceive?: () => void;
  onChat: () => void;
}) {
  const yours = controller.catalog.filter(
    model =>
      isImported(model) ||
      !['checking', 'not-downloaded'].includes(
        controller.states[model.id] || 'checking',
      ),
  );
  const suggestion = controller.catalog.find(
    model => model.id === SUPPORTED_MODELS[0]?.id,
  );
  const hasText = yours.some(
    model =>
      !isVision(model) &&
      (downloaded(controller.states[model.id]) ||
        ['downloading', 'validating'].includes(controller.states[model.id])),
  );
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.catalog}>
        <View style={styles.section}>
          <Text
            accessibilityRole="header"
            style={[styles.sectionTitle, { color: colors.accent }]}
          >
            Your models
          </Text>
        </View>
        {onReceive ? (
          <Button
            label="Receive model nearby"
            icon="connected"
            colors={colors}
            disabled={controller.generationActive || controller.importing}
            onPress={onReceive}
          />
        ) : null}
        {yours.map(model => (
          <ModelCard
            key={model.id}
            model={model}
            controller={controller}
            colors={colors}
            onChat={onChat}
            onShare={onShare}
          />
        ))}
        {!yours.length ? (
          <Text style={[styles.empty, { color: colors.muted }]}>
            Downloaded models and download progress appear here.
          </Text>
        ) : null}
        {!hasText &&
        suggestion &&
        !yours.some(model => model.id === suggestion.id) ? (
          <ModelSuggestion
            model={suggestion}
            controller={controller}
            colors={colors}
            onBrowse={onDiscover}
          />
        ) : null}
        <View style={[styles.storage, { borderColor: colors.border }]}>
          <Icon name="shield" color={colors.muted} size={18} />
          <Text style={[styles.storageText, { color: colors.muted }]}>
            {controller.freeSpace === null
              ? 'Storage unavailable'
              : `${formatBytes(controller.freeSpace)} free`}{' '}
            · Models and chats stay on device. Performance varies by device.
          </Text>
        </View>
      </ScrollView>
      {Platform.OS === 'android' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Find more models"
          onPress={onDiscover}
          android_ripple={{ color: colors.border }}
          style={[
            styles.fab,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Icon name="plus" size={28} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}
export { ModelDiscovery } from './ModelDiscovery';
export function ModelPicker({
  visible,
  onClose,
  controller,
  colors,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  controller: ModelController;
  colors: Colors;
  onSelect?: (model: ModelManifest) => Promise<boolean>;
}) {
  const models = controller.catalog.filter(model =>
    downloaded(controller.states[model.id] || 'checking'),
  );
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Choose a model"
      colors={colors}
    >
      {models.length ? (
        models.map(model => (
          <Pressable
            key={model.id}
            accessibilityRole="button"
            accessibilityState={{
              selected:
                controller.model.id === model.id && Boolean(controller.context),
              disabled: controller.generationActive,
            }}
            disabled={
              controller.generationActive ||
              Object.values(controller.states).some(
                value => value === 'loading',
              )
            }
            onPress={async () => {
              if (
                controller.states[model.id] === 'active' ||
                (await (onSelect ? onSelect(model) : controller.load(model)))
              )
                onClose();
            }}
            style={[styles.pickerRow, { borderColor: colors.border }]}
          >
            <Icon
              name={isVision(model) ? 'image' : 'chat'}
              color={colors.accent}
            />
            <View style={styles.pickerText}>
              <Text style={[styles.pickerName, { color: colors.text }]}>
                {model.displayName}
              </Text>
              <Text style={[styles.detailText, { color: colors.muted }]}>
                {labels[controller.states[model.id]]} ·{' '}
                {isImported(model)
                  ? quantization(model.originalFileName)
                  : 'Q4_K_M'}{' '}
                ·{' '}
                {model.byteSize ? formatBytes(model.byteSize) : 'Unknown size'}
              </Text>
            </View>
            {controller.states[model.id] === 'active' ? (
              <Icon name="check" color={colors.green} />
            ) : controller.states[model.id] === 'loading' ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Icon name="download" color={colors.muted} />
            )}
            {controller.errors[model.id] ? (
              <Text style={{ color: colors.danger }}>
                {controller.errors[model.id]}
              </Text>
            ) : null}
          </Pressable>
        ))
      ) : (
        <Text style={[styles.empty, { color: colors.muted }]}>
          No downloaded models. Open Models to download one first.
        </Text>
      )}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  catalog: { paddingHorizontal: 10, paddingBottom: 112 },
  section: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 24,
    paddingBottom: 20,
    minHeight: 64,
  },
  sectionTitle: { fontSize: 17, fontWeight: '500' },
  sectionHint: { fontSize: 13, marginTop: 4 },
  empty: {
    fontSize: 14,
    lineHeight: 22,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  card: {
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
  },
  iosCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 6,
  },
  cardHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  name: { flex: 1, fontSize: 16, fontWeight: '500' },
  size: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 16,
  },
  mainAction: { flex: 1 },
  working: {
    minHeight: 48,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    marginTop: 16,
    gap: 12,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailText: { fontSize: 13, lineHeight: 20 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  track: { height: 4, borderRadius: 4, overflow: 'hidden', marginTop: 16 },
  progress: { height: '100%' },
  progressText: { fontSize: 12, marginTop: 8 },
  error: { fontSize: 13, lineHeight: 20, marginTop: 12 },
  storage: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 20,
  },
  storageText: { flex: 1, fontSize: 12, lineHeight: 19 },
  fab: {
    position: 'absolute',
    right: 28,
    bottom: 24,
    width: 60,
    height: 60,
    borderWidth: 1,
    borderRadius: 18,
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 26,
    paddingHorizontal: 18,
  },
  searchInput: { flex: 1, fontSize: 16, minHeight: 52 },
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  filter: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 24,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexWrap: 'wrap',
  },
  pickerText: { flex: 1 },
  pickerName: { fontSize: 17 },
});
