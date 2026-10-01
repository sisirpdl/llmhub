import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { readDeviceMemory, type DeviceMemory } from '../device/memory';
import type { ModelController } from '../app/useModelController';
import { Button, IconButton } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { formatBytes, type Colors } from '../ui/theme';
import { compactNumber, type HubDetails, type HubFile } from './huggingFace';
import { fromHub } from './importedModels';
import {
  estimateSuitability,
  storageShortfall,
  type MemoryMetadata,
} from './deviceSuitability';
import { readGGUFMetadata } from './ggufMetadata';
const sizes = (value: number) =>
  value > 0
    ? value < 1024 ** 3
      ? `${Math.ceil(value / 1024 ** 2)} MB`
      : formatBytes(value)
    : 'Unknown';
const labels = {
  fits: 'Likely fits',
  tight: 'Tight fit',
  large: 'Too large',
  unknown: 'Unknown',
};
export function GGUFVariants({
  details,
  token,
  controller,
  colors,
  onImported,
}: {
  details: HubDetails;
  token: string;
  controller: ModelController;
  colors: Colors;
  onImported: () => void;
}) {
  const [memory, setMemory] = useState<DeviceMemory | null>(null);
  const [metadata, setMetadata] = useState<
    Record<string, MemoryMetadata | null>
  >({});
  const [checking, setChecking] = useState(true);
  const [supported, setSupported] = useState(true);
  const [quant, setQuant] = useState('All');
  const [selected, setSelected] = useState<HubFile | null>(null);
  const [vision, setVision] = useState(false);
  const [projector, setProjector] = useState<HubFile | null>(null);
  const [contextLength, setContextLength] = useState(2048);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const files = details.files.filter(f => !f.projector);
  const projectors = details.files.filter(f => f.projector && !f.split);
  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      readDeviceMemory().then(value => {
        if (!disposed) setMemory(value);
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    setMetadata({});
    setChecking(true);
    let cursor = 0;
    const candidates = details.files.filter(f => !f.projector && !f.split);
    async function worker() {
      while (cursor < candidates.length && !abort.signal.aborted) {
        const file = candidates[cursor++];
        const value = await readGGUFMetadata(
          details,
          file,
          token,
          abort.signal,
        );
        if (!abort.signal.aborted)
          setMetadata(current => ({ ...current, [file.path]: value }));
      }
    }
    Promise.all([worker(), worker()]).finally(() => {
      if (!abort.signal.aborted) setChecking(false);
    });
    return () => abort.abort();
  }, [details, token]);
  const projection = vision ? projector?.size || 0 : 0;
  const suitability = (file: HubFile) =>
    vision && (!projector || projector.size <= 0)
      ? { status: 'unknown' as const, estimatedBytes: null }
      : estimateSuitability(
          file.size,
          metadata[file.path] || null,
          memory,
          contextLength,
          projection,
          vision,
        );
  const visible = files.filter(
    file =>
      (quant === 'All' || file.quantization === quant) &&
      (!supported || (!file.split && suitability(file).status === 'fits')),
  );
  const hidden =
    files.filter(file => quant === 'All' || file.quantization === quant)
      .length - visible.length;
  const missing = selected
    ? storageShortfall(selected.size, projection, controller.freeSpace)
    : 0;
  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        s.chip,
        {
          borderColor: active ? colors.accent : colors.border,
          backgroundColor: active ? colors.elevated : colors.input,
        },
      ]}
    >
      <Text style={{ color: active ? colors.accent : colors.muted }}>
        {label}
      </Text>
    </Pressable>
  );
  const info = () =>
    Alert.alert(
      'Estimated device support',
      'Supported means estimated RAM fit with safety headroom, not a guarantee of engine compatibility. We include model weights, FP16 context cache, working buffers, and selected vision projector/image overhead. Device memory changes as other apps run. Unknown architectures or missing metadata appear under All. Storage is checked separately.',
    );
  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.body}
      >
        <Text style={[s.small, { color: colors.muted }]}>
          {details.model.author}
        </Text>
        <Text style={[s.title, { color: colors.text }]}>
          {details.model.name}
        </Text>
        <Text style={[s.small, { color: colors.muted }]}>
          ↓ {compactNumber(details.model.downloads)} · ♡{' '}
          {compactNumber(details.model.likes)} · {details.license}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(`https://huggingface.co/${details.model.id}`).catch(
              () => setError('Unable to open the repository.'),
            )
          }
        >
          <Text style={{ color: colors.accent }}>View repository ↗</Text>
        </Pressable>
        <View style={[s.device, { backgroundColor: colors.elevated }]}>
          <View style={s.grow}>
            <Text style={[s.label, { color: colors.text }]}>Your device</Text>
            <Text style={[s.small, { color: colors.muted }]}>
              RAM budget:{' '}
              {memory
                ? sizes(memory.appBudgetBytes)
                : 'Unavailable — rebuild app'}{' '}
              · Storage:{' '}
              {controller.freeSpace !== null
                ? sizes(controller.freeSpace) + ' free'
                : 'Unavailable'}
            </Text>
          </View>
          <IconButton
            name="info"
            label="Explain device support estimate"
            colors={colors}
            onPress={info}
          />
        </View>
        <View style={s.row}>
          {(['Supported', 'All'] as const).map(label => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`Show ${label.toLowerCase()} variants`}
              accessibilityState={{
                selected: supported === (label === 'Supported'),
              }}
              onPress={() => setSupported(label === 'Supported')}
              style={s.textButton}
            >
              <Text
                style={[
                  s.label,
                  {
                    color:
                      supported === (label === 'Supported')
                        ? colors.accent
                        : colors.muted,
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          <View style={s.grow} />
          <Text style={[s.small, { color: colors.muted }]}>
            {hidden ? `${hidden} hidden` : files.length + ' variants'}
          </Text>
        </View>
        {checking ? (
          <View style={s.row}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={[s.small, { color: colors.muted }]}>
              Checking GGUF memory requirements…
            </Text>
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.row}
        >
          {['All', ...new Set(files.map(f => f.quantization))].map(q =>
            chip(q, quant === q, () => setQuant(q)),
          )}
        </ScrollView>
        <Text style={[s.small, { color: colors.muted }]}>
          Context length · included in RAM estimate
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.row}
        >
          {[512, 1024, 2048, 4096, 8192].map(value =>
            chip(
              value >= 1024 ? `${value / 1024}K` : String(value),
              contextLength === value,
              () => setContextLength(value),
            ),
          )}
        </ScrollView>
        {visible.map(file => {
          const fit = suitability(file);
          const shortfall = storageShortfall(
            file.size,
            projection,
            controller.freeSpace,
          );
          return (
            <Pressable
              key={file.path}
              accessibilityRole="button"
              accessibilityLabel={`Select ${file.path}`}
              accessibilityState={{
                selected: selected?.path === file.path,
                disabled: file.split,
              }}
              disabled={file.split}
              onPress={() => {
                setSelected(file);
                setError('');
              }}
              style={[
                s.file,
                file.split && s.disabled,
                {
                  backgroundColor: colors.input,
                  borderColor:
                    selected?.path === file.path
                      ? colors.accent
                      : colors.border,
                },
              ]}
            >
              <View style={s.row}>
                <Text style={[s.label, s.grow, { color: colors.text }]}>
                  {file.path}
                </Text>
                {selected?.path === file.path ? (
                  <Icon name="check" size={18} color={colors.accent} />
                ) : null}
              </View>
              <View style={s.row}>
                <Text style={{ color: colors.accent }}>
                  {file.quantization}
                </Text>
                <Text style={{ color: colors.muted }}>{sizes(file.size)}</Text>
                <View style={s.grow} />
                <Text
                  style={[
                    s.small,
                    {
                      color:
                        fit.status === 'fits'
                          ? colors.green
                          : fit.status === 'large'
                          ? colors.danger
                          : colors.muted,
                    },
                  ]}
                >
                  {labels[fit.status]}
                </Text>
              </View>
              <Text style={[s.small, { color: colors.muted }]}>
                {fit.estimatedBytes
                  ? `~${sizes(
                      fit.estimatedBytes,
                    )} RAM at ${contextLength} context tokens`
                  : vision && (!projector || projector.size <= 0)
                  ? 'Select a projector to estimate vision RAM'
                  : 'RAM estimate unavailable'}
                {file.split ? ' · Split files unsupported' : ''}
              </Text>
              {shortfall !== null && shortfall > 0 ? (
                <View style={s.row}>
                  <Icon name="storage" color={colors.danger} size={16} />
                  <Text style={[s.small, { color: colors.danger }]}>
                    Needs {sizes(shortfall)} more storage
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {!visible.length ? (
          <View style={s.empty}>
            <Text style={{ color: colors.muted }}>
              {checking
                ? 'Suitable variants will appear as metadata is checked.'
                : 'No variants with a confident RAM fit at this context length.'}
            </Text>
            {supported ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setSupported(false)}
                style={s.textButton}
              >
                <Text style={{ color: colors.accent }}>Show all variants</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {projectors.length ? (
          <>
            <View style={s.row}>
              <View style={s.grow}>
                <Text style={[s.label, { color: colors.text }]}>
                  Enable vision
                </Text>
                <Text style={[s.small, { color: colors.muted }]}>
                  Select a projector matching this model.
                </Text>
              </View>
              <Switch value={vision} onValueChange={setVision} />
            </View>
            {vision
              ? projectors.map(file => (
                  <Pressable
                    key={file.path}
                    accessibilityRole="button"
                    accessibilityLabel={`Select projector ${file.path}`}
                    accessibilityState={{
                      selected: projector?.path === file.path,
                    }}
                    onPress={() => setProjector(file)}
                    style={[
                      s.file,
                      {
                        borderColor:
                          projector?.path === file.path
                            ? colors.accent
                            : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>{file.path}</Text>
                    <Text style={[s.small, { color: colors.muted }]}>
                      {sizes(file.size)}{' '}
                      {projector?.path === file.path ? '✓' : ''}
                    </Text>
                  </Pressable>
                ))
              : null}
          </>
        ) : null}
        {details.model.gated ? (
          <Text style={[s.small, { color: colors.muted }]}>
            Accept the repository license and provide a read token in Filters.
          </Text>
        ) : null}
      </ScrollView>
      <View style={[s.footer, { borderColor: colors.border }]}>
        {selected ? (
          <Text numberOfLines={1} style={[s.small, { color: colors.muted }]}>
            {selected.path} · {labels[suitability(selected).status]}
          </Text>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}
        {missing !== null && missing > 0 ? (
          <Text style={[s.small, { color: colors.danger }]}>
            Free {sizes(missing)} to download this model.
          </Text>
        ) : null}
        <Button
          label={
            working
              ? 'Preparing…'
              : selected
              ? `Download · ${sizes(selected.size + projection)}`
              : 'Select a variant'
          }
          icon="download"
          colors={colors}
          disabled={
            !selected ||
            working ||
            (vision && !projector) ||
            (missing !== null && missing > 0) ||
            (supported &&
              selected !== null &&
              suitability(selected).status !== 'fits')
          }
          onPress={async () => {
            if (!selected) return;
            setWorking(true);
            setError('');
            try {
              const model = fromHub(
                details,
                selected,
                vision ? projector! : undefined,
              );
              model.recommendedContextLength = contextLength;
              if (await controller.addRemote(model, token)) onImported();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Import failed.');
            } finally {
              setWorking(false);
            }
          }}
        />
      </View>
    </>
  );
}
const s = StyleSheet.create({
  body: { gap: 12, paddingBottom: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  small: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 15, fontWeight: '500' },
  title: { fontSize: 24, fontWeight: '600', lineHeight: 31 },
  device: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    borderRadius: 14,
  },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: Platform.OS === 'ios' ? 12 : 20,
  },
  file: {
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderRadius: Platform.OS === 'ios' ? 14 : 16,
  },
  disabled: { opacity: 0.5 },
  empty: { paddingVertical: 16, gap: 10 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
});
