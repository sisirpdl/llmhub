import { showDialog } from '../ui/Popups';
import { useEffect, useState } from 'react';
import {
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
import { fileSizeFit, storageShortfall } from './deviceSuitability';
const sizes = (value: number) =>
  value > 0
    ? value < 1024 ** 3
      ? `${Math.ceil(value / 1024 ** 2)} MB`
      : formatBytes(value)
    : 'Unknown';
const labels = {
  fits: 'Likely fits',
  large: 'Above size limit',
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
  const [memoryChecked, setMemoryChecked] = useState(false);
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
        if (!disposed) {
          setMemory(value);
          setMemoryChecked(true);
        }
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
  const projection = vision ? projector?.size || 0 : 0;
  const suitability = (file: HubFile) =>
    file.split || (vision && (!projector || projector.size <= 0))
      ? ('unknown' as const)
      : fileSizeFit(file.size, memory, projection);
  const visible = files.filter(
    file =>
      (quant === 'All' || file.quantization === quant) &&
      (!supported || (!file.split && suitability(file) === 'fits')),
  );
  const hidden =
    files.filter(file => quant === 'All' || file.quantization === quant)
      .length - visible.length;
  const missing = selected
    ? storageShortfall(selected.size, projection, controller.freeSpace)
    : 0;
  const matching = files.filter(
    file => quant === 'All' || file.quantization === quant,
  );
  const unknownReason = (file: HubFile) => {
    if (file.split) return 'Split GGUF files are not supported.';
    if (!memoryChecked) return 'Reading device memory…';
    if (!memory)
      return 'Device RAM could not be checked. File-size filtering is unavailable on this device.';
    if (memory.appBudgetBytes <= 0)
      return 'No safe RAM budget is currently available. Close other apps and reopen this screen.';
    if (vision && (!projector || projector.size <= 0))
      return 'Choose a vision projector to check the combined file size.';
    if (file.size <= 0) return 'Model download size is unavailable.';
    return 'File-size check unavailable.';
  };
  const emptyMessage = () => {
    if (!matching.length)
      return 'No GGUF files match this quantization filter.';
    if (!supported) return 'No variants match these filters.';
    if (!memoryChecked) return 'Reading device memory…';
    if (!memory)
      return 'Device RAM could not be checked. Open All to browse without the size filter.';
    if (memory.appBudgetBytes <= 0)
      return 'No RAM budget is available. Close other apps and try again.';
    if (vision && (!projector || projector.size <= 0))
      return 'Choose a vision projector to check the combined file size.';
    if (matching.every(file => file.split))
      return 'Split GGUF files are not supported.';
    return 'No variants match this size filter. Open All to browse larger files or files with an unknown size.';
  };
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
    showDialog(
      'About the size filter',
      'Likely fits shows model files up to 80% of the app’s RAM budget, including the selected vision projector. Filtered by file size, not measured RAM usage. Models need extra memory while running. Longer context uses more memory, but does not change the download size. All shows larger files and unknown sizes.',
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
                : memoryChecked
                ? 'Unavailable'
                : 'Checking…'}{' '}
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
          {(['Likely fits', 'All'] as const).map(label => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={`Show ${label.toLowerCase()} variants`}
              accessibilityState={{
                selected: supported === (label === 'Likely fits'),
              }}
              onPress={() => setSupported(label === 'Likely fits')}
              style={s.textButton}
            >
              <Text
                style={[
                  s.label,
                  {
                    color:
                      supported === (label === 'Likely fits')
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
          Context window (tokens) · longer context uses more memory
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
                <Text style={{ color: colors.muted }}>{file.quantization}</Text>
                <Text style={{ color: colors.muted }}>{sizes(file.size)}</Text>
                <View style={s.grow} />
                <Text
                  style={[
                    s.small,
                    {
                      color: colors.muted,
                    },
                  ]}
                >
                  {labels[fit]}
                </Text>
              </View>
              <Text style={[s.small, { color: colors.muted }]}>
                {fit === 'unknown'
                  ? unknownReason(file)
                  : fit === 'fits'
                  ? 'Within the file-size limit. Extra memory is needed during use.'
                  : 'Above the file-size limit. Loading may fail.'}
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
            <Text style={{ color: colors.muted }}>{emptyMessage()}</Text>
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
            Accept the repository license and enter a read token in Settings.
          </Text>
        ) : null}
      </ScrollView>
      <View style={[s.footer, { borderColor: colors.border }]}>
        {selected ? (
          <Text numberOfLines={1} style={[s.small, { color: colors.muted }]}>
            {selected.path} · {labels[suitability(selected)]}
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
            (supported && selected !== null && suitability(selected) !== 'fits')
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
