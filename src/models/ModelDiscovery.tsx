import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ModelController } from '../app/useModelController';
import { Button, IconButton, Sheet } from '../ui/Controls';
import { Icon, type IconName } from '../ui/Icon';
import { formatBytes, type Colors } from '../ui/theme';
import {
  compactNumber,
  getHubDetails,
  searchHub,
  timeAgo,
  type HubDetails,
  type HubFile,
  type HubFilters,
  type HubModel,
  type HubSort,
} from './huggingFace';
import {
  fromHub,
  fromRemote,
  pickGGUF,
  probeSize,
  type PickedGGUF,
} from './importedModels';
const initial: HubFilters = {
  search: '',
  author: '',
  sort: 'trendingScore',
  task: 'all',
  hideGated: false,
};
const sizes = (bytes: number) =>
  bytes
    ? bytes < 1024 ** 3
      ? `${(bytes / 1024 ** 2).toFixed(0)} MB`
      : formatBytes(bytes)
    : 'Size unavailable';
const sorts: [HubSort, string][] = [
  ['trendingScore', 'Trending'],
  ['downloads', 'Downloads'],
  ['likes', 'Likes'],
  ['lastModified', 'Recently updated'],
];
export function ModelDiscovery({
  visible,
  onClose,
  controller,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  controller: ModelController;
  colors: Colors;
}) {
  const [page, setPage] = useState<'add' | 'hub' | 'local' | 'remote'>('add');
  const [filters, setFilters] = useState(initial);
  const [filterOpen, setFilterOpen] = useState(false);
  const [token, setToken] = useState('');
  const [models, setModels] = useState<HubModel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [repository, setRepository] = useState<HubModel | null>(null);
  const [details, setDetails] = useState<HubDetails | null>(null);
  const [selected, setSelected] = useState<HubFile | null>(null);
  const [vision, setVision] = useState(false);
  const [projector, setProjector] = useState<HubFile | null>(null);
  const [quant, setQuant] = useState('All');
  const [file, setFile] = useState<PickedGGUF | null>(null);
  const [localProjector, setLocalProjector] = useState<PickedGGUF | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [sha, setSha] = useState('');
  const [working, setWorking] = useState(false);
  const request = useRef<AbortController | null>(null);
  const session = useRef(0);
  const { height } = useWindowDimensions();
  useEffect(() => {
    if (!visible) {
      session.current++;
      request.current?.abort();
      setToken('');
      setPage('add');
      setRepository(null);
      setDetails(null);
      setSelected(null);
      setError('');
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || page !== 'hub') return;
    const abort = new AbortController();
    request.current?.abort();
    request.current = abort;
    setError('');
    setLoading(true);
    const timer = setTimeout(
      () => {
        const operation = repository
          ? getHubDetails(repository, token, abort.signal).then(value => {
              if (!abort.signal.aborted) {
                setDetails(value);
                setProjector(null);
                setVision(false);
                setSelected(null);
                setQuant('All');
              }
            })
          : searchHub(filters, token, abort.signal).then(value => {
              if (!abort.signal.aborted) {
                setModels(value.models);
                setNext(value.next);
              }
            });
        operation
          .catch(e => {
            if (!abort.signal.aborted)
              setError(e.message || 'Unable to connect. Try again.');
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      repository ? 0 : 350,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [visible, page, filters, token, repository, retry]);
  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    secure = false,
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={colors.muted}
      value={value}
      onChangeText={set}
      secureTextEntry={secure}
      autoCapitalize="none"
      autoCorrect={false}
      style={[
        s.input,
        {
          backgroundColor: colors.input,
          color: colors.text,
          borderColor: colors.border,
        },
      ]}
    />
  );
  const chip = (label: string, active: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        s.chip,
        {
          backgroundColor: active ? colors.elevated : colors.surface,
          borderColor: active ? colors.accent : colors.border,
        },
      ]}
    >
      <Text
        style={[s.chipText, { color: active ? colors.accent : colors.muted }]}
      >
        {label}
      </Text>
    </Pressable>
  );
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  const run = async (action: () => Promise<boolean>) => {
    const version = session.current;
    setWorking(true);
    setError('');
    try {
      if ((await action()) && version === session.current) close();
    } catch (e) {
      if (version === session.current)
        setError(
          e instanceof Error ? e.message : 'Import failed. Please retry.',
        );
    } finally {
      setWorking(false);
    }
  };
  const choose = async (projection = false) => {
    try {
      const picked = await pickGGUF();
      if (picked) {
        if (projection) setLocalProjector(picked);
        else setFile(picked);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Unable to open the file picker. Rebuild the app after installing dependencies.',
      );
    }
  };
  const stats = (model: HubModel) => (
    <View style={s.stats}>
      <Text style={[s.small, { color: colors.muted }]}>
        ↓ {compactNumber(model.downloads)} downloads
      </Text>
      <Text style={[s.small, { color: colors.muted }]}>
        ♡ {compactNumber(model.likes)}
      </Text>
      <Text style={[s.small, { color: colors.muted }]}>
        {timeAgo(model.updatedAt)}
      </Text>
    </View>
  );
  const footer = error ? (
    <View style={s.error}>
      <Text accessibilityLiveRegion="polite" style={{ color: colors.danger }}>
        {error}
      </Text>
      {page === 'hub' ? (
        <Button
          label="Retry"
          onPress={() => setRetry(v => v + 1)}
          colors={colors}
        />
      ) : null}
    </View>
  ) : null;
  const entry = (
    title: string,
    subtitle: string,
    icon: IconName,
    target: typeof page,
  ) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        setPage(target);
        setError('');
      }}
      style={[
        s.entry,
        { borderColor: colors.border, backgroundColor: colors.input },
      ]}
    >
      <View style={[s.entryIcon, { backgroundColor: colors.elevated }]}>
        <Icon name={icon} color={colors.accent} />
      </View>
      <View style={s.grow}>
        <Text style={[s.heading, { color: colors.text }]}>{title}</Text>
        <Text style={[s.description, { color: colors.muted }]}>{subtitle}</Text>
      </View>
      <Icon name="arrow" color={colors.muted} />
    </Pressable>
  );
  const back = () => {
    setError('');
    if (repository) {
      setRepository(null);
      setDetails(null);
      setSelected(null);
    } else setPage('add');
  };
  const files = details?.files.filter(f => !f.projector) || [];
  const projectors = details?.files.filter(f => f.projector && !f.split) || [];
  const quants = ['All', ...new Set(files.map(f => f.quantization))];
  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={
        page === 'add'
          ? 'Add a model'
          : page === 'hub'
          ? repository
            ? 'GGUF files'
            : 'Hugging Face'
          : page === 'local'
          ? 'Add local model'
          : 'Add remote model'
      }
      colors={colors}
      scroll={false}
    >
      <View style={[s.panel, { height: Math.min(height * 0.72, 720) }]}>
        {page !== 'add' ? (
          <View style={s.back}>
            <IconButton
              name="back"
              label="Back to model sources"
              colors={colors}
              onPress={back}
            />
            <Text style={{ color: colors.muted }}>
              {repository ? 'Back to search' : 'Model sources'}
            </Text>
          </View>
        ) : null}
        {page === 'add' ? (
          <ScrollView contentContainerStyle={s.body}>
            {entry(
              'Hugging Face',
              'Explore repositories and choose a GGUF variant.',
              'search',
              'hub',
            )}
            {entry(
              'Local model',
              'Import a GGUF file from your device.',
              'models',
              'local',
            )}
            {entry(
              'Remote model',
              'Download a GGUF from an HTTPS URL.',
              'external',
              'remote',
            )}
            <Text style={[s.description, { color: colors.muted }]}>
              Models run on your device. Choose a size that fits your available
              memory and storage.
            </Text>
          </ScrollView>
        ) : null}
        {page === 'hub' && !repository ? (
          <>
            <View style={[s.search, { backgroundColor: colors.input }]}>
              <Icon name="search" color={colors.muted} />
              <TextInput
                accessibilityLabel="Search Hugging Face"
                placeholder="Search GGUF models"
                placeholderTextColor={colors.muted}
                value={filters.search}
                onChangeText={search => setFilters(v => ({ ...v, search }))}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.searchInput, { color: colors.text }]}
              />
            </View>
            <View style={s.row}>
              {chip('Filters', filterOpen, () => setFilterOpen(v => !v))}
              <Text style={[s.small, { color: colors.muted }]}>
                {sorts.find(v => v[0] === filters.sort)?.[1]} ·{' '}
                {filters.task === 'all' ? 'All models' : filters.task}
              </Text>
            </View>
            {filterOpen ? (
              <ScrollView
                style={s.filterPanel}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.body}
              >
                {field('Author / organization', filters.author, author =>
                  setFilters(v => ({ ...v, author })),
                )}
                <View style={s.wrap}>
                  {sorts.map(([sort, label]) =>
                    chip(label, filters.sort === sort, () =>
                      setFilters(v => ({ ...v, sort })),
                    ),
                  )}
                </View>
                <View style={s.wrap}>
                  {(['all', 'text', 'vision'] as const).map(task =>
                    chip(
                      task === 'all'
                        ? 'All types'
                        : task === 'text'
                        ? 'Text'
                        : 'Vision',
                      filters.task === task,
                      () => setFilters(v => ({ ...v, task })),
                    ),
                  )}
                </View>
                <View style={s.row}>
                  <Text style={[s.grow, { color: colors.text }]}>
                    Hide gated models
                  </Text>
                  <Switch
                    value={filters.hideGated}
                    onValueChange={hideGated =>
                      setFilters(v => ({ ...v, hideGated }))
                    }
                  />
                </View>
                {field(
                  'Hugging Face read token (optional)',
                  token,
                  setToken,
                  true,
                )}
                <Text style={[s.small, { color: colors.muted }]}>
                  Token stays in memory for downloads and is never saved to
                  storage.
                </Text>
              </ScrollView>
            ) : null}
            {loading ? (
              <ActivityIndicator color={colors.accent} style={s.spinner} />
            ) : null}
            {footer}
            <FlatList
              data={models}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.id}`}
                  onPress={() => {
                    Keyboard.dismiss();
                    setDetails(null);
                    setRepository(item);
                  }}
                  style={[s.repo, { borderColor: colors.border }]}
                >
                  <Text style={[s.small, { color: colors.muted }]}>
                    {item.author}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[s.repoName, { color: colors.text }]}
                  >
                    {item.name}
                  </Text>
                  {stats(item)}
                  <View style={s.wrap}>
                    {item.vision ? (
                      <Text
                        style={[
                          s.badge,
                          {
                            backgroundColor: colors.elevated,
                            color: colors.accent,
                          },
                        ]}
                      >
                        Vision
                      </Text>
                    ) : null}
                    {item.gated ? (
                      <Text
                        style={[
                          s.badge,
                          {
                            backgroundColor: colors.elevated,
                            color: colors.muted,
                          },
                        ]}
                      >
                        Requires token
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                !loading && !error ? (
                  <Text
                    style={[s.description, s.empty, { color: colors.muted }]}
                  >
                    No GGUF repositories found. Try another search or author.
                  </Text>
                ) : null
              }
              ListFooterComponent={
                next && !loading ? (
                  <Button
                    label="Load more"
                    colors={colors}
                    onPress={() => {
                      const abort = request.current;
                      if (!abort) return;
                      setLoading(true);
                      searchHub(filters, token, abort.signal, next)
                        .then(value => {
                          if (!abort.signal.aborted) {
                            setModels(v => [
                              ...v,
                              ...value.models.filter(
                                m => !v.some(old => old.id === m.id),
                              ),
                            ]);
                            setNext(value.next);
                          }
                        })
                        .catch(e => {
                          if (!abort.signal.aborted) setError(e.message);
                        })
                        .finally(() => {
                          if (!abort.signal.aborted) setLoading(false);
                        });
                    }}
                  />
                ) : null
              }
            />
          </>
        ) : null}
        {page === 'hub' && repository ? (
          <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.body}
            >
              <Text style={[s.small, { color: colors.muted }]}>
                {repository.author}
              </Text>
              <Text style={[s.title, { color: colors.text }]}>
                {repository.name}
              </Text>
              {stats(repository)}
              {repository.gated ? (
                <Text style={{ color: colors.muted }}>
                  Accept this repository’s license on Hugging Face, then enter a
                  read token in Filters.
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="link"
                onPress={() =>
                  Linking.openURL(
                    `https://huggingface.co/${repository.id}`,
                  ).catch(() => setError('Unable to open the repository.'))
                }
              >
                <Text style={{ color: colors.accent }}>View repository ↗</Text>
              </Pressable>
              {loading ? <ActivityIndicator color={colors.accent} /> : null}
              {footer}
              {details ? (
                <>
                  <Text style={[s.small, { color: colors.muted }]}>
                    {details.license} · {files.length} GGUF variants
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.wrap}
                  >
                    {quants.map(q => chip(q, quant === q, () => setQuant(q)))}
                  </ScrollView>
                  {files
                    .filter(f => quant === 'All' || f.quantization === quant)
                    .map(f => (
                      <Pressable
                        key={f.path}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: selected?.path === f.path,
                          disabled: f.split,
                        }}
                        accessibilityLabel={`Select ${f.path}`}
                        disabled={f.split}
                        onPress={() => setSelected(f)}
                        style={[
                          s.file,
                          f.split && s.disabled,
                          {
                            backgroundColor: colors.input,
                            borderColor:
                              selected?.path === f.path
                                ? colors.accent
                                : colors.border,
                          },
                        ]}
                      >
                        <Text style={[s.fileName, { color: colors.text }]}>
                          {f.path}
                        </Text>
                        <View style={s.stats}>
                          <Text style={{ color: colors.accent }}>
                            {f.quantization}
                          </Text>
                          <Text style={{ color: colors.muted }}>
                            {sizes(f.size)}
                          </Text>
                          {selected?.path === f.path ? (
                            <Icon
                              name="check"
                              color={colors.accent}
                              size={18}
                            />
                          ) : null}
                        </View>
                        <Text style={[s.small, { color: colors.muted }]}>
                          {f.split
                            ? 'Split GGUF files are not supported'
                            : f.sha256
                            ? 'Published SHA-256 verified during download'
                            : 'No published checksum · GGUF format checked'}
                        </Text>
                      </Pressable>
                    ))}
                  {!files.length ? (
                    <Text style={{ color: colors.muted }}>
                      No model GGUF files in this repository.
                    </Text>
                  ) : null}
                  {projectors.length ? (
                    <>
                      <View style={s.row}>
                        <View style={s.grow}>
                          <Text style={[s.heading, { color: colors.text }]}>
                            Enable vision
                          </Text>
                          <Text style={[s.small, { color: colors.muted }]}>
                            Choose a projector matching your model.
                          </Text>
                        </View>
                        <Switch value={vision} onValueChange={setVision} />
                      </View>
                      {vision
                        ? projectors.map(f => (
                            <Pressable
                              key={f.path}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected: projector?.path === f.path,
                              }}
                              onPress={() => setProjector(f)}
                              style={[
                                s.file,
                                {
                                  borderColor:
                                    projector?.path === f.path
                                      ? colors.accent
                                      : colors.border,
                                },
                              ]}
                            >
                              <Text style={{ color: colors.text }}>
                                {f.path}
                              </Text>
                              <Text style={{ color: colors.muted }}>
                                {sizes(f.size)}{' '}
                                {projector?.path === f.path ? '✓' : ''}
                              </Text>
                            </Pressable>
                          ))
                        : null}
                    </>
                  ) : null}
                  <Text style={[s.small, { color: colors.muted }]}>
                    File size is storage use, not peak memory use. Larger
                    quantizations may exceed your device’s RAM.
                  </Text>
                </>
              ) : null}
            </ScrollView>
            {details && !loading ? (
              <View style={s.footer}>
                <Button
                  label={
                    working
                      ? 'Starting download…'
                      : `Download${
                          selected
                            ? ' · ' +
                              sizes(
                                selected.size +
                                  (vision ? projector?.size || 0 : 0),
                              )
                            : ''
                        }`
                  }
                  colors={colors}
                  disabled={!selected || (vision && !projector) || working}
                  icon="download"
                  onPress={() =>
                    run(() =>
                      controller.addRemote(
                        fromHub(
                          details!,
                          selected!,
                          vision ? projector! : undefined,
                        ),
                        token,
                      ),
                    )
                  }
                />
              </View>
            ) : null}
          </>
        ) : null}
        {page === 'local' ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            <Text style={[s.description, { color: colors.muted }]}>
              Copy a GGUF into app storage. Your original file stays in its
              current location.
            </Text>
            <Button
              label={file ? 'Change model file' : 'Choose GGUF file'}
              icon="models"
              colors={colors}
              onPress={() => choose()}
            />
            {file ? (
              <Text style={{ color: colors.text }}>
                {file.name} · {sizes(file.size || 0)}
              </Text>
            ) : null}
            <Button
              label={
                localProjector
                  ? 'Change projector'
                  : 'Add vision projector (optional)'
              }
              colors={colors}
              onPress={() => choose(true)}
            />
            {localProjector ? (
              <View style={s.row}>
                <Text style={[s.grow, { color: colors.text }]}>
                  {localProjector.name}
                </Text>
                <IconButton
                  name="close"
                  label="Remove projector"
                  colors={colors}
                  onPress={() => setLocalProjector(null)}
                />
              </View>
            ) : null}
            {footer}
            <Button
              label={working ? 'Copying and checking…' : 'Import model'}
              colors={colors}
              disabled={!file || working}
              onPress={() =>
                run(() =>
                  controller.addLocal(file!, localProjector || undefined),
                )
              }
            />
          </ScrollView>
        ) : null}
        {page === 'remote' ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            <Text style={[s.description, { color: colors.muted }]}>
              Paste a direct HTTPS link to a GGUF file.
            </Text>
            {field('Model name (optional)', name, setName)}
            {field('HTTPS download URL', url, setUrl)}
            {field('SHA-256 (optional)', sha, setSha)}
            <Text style={[s.small, { color: colors.muted }]}>
              A published checksum lets us verify the download. Without one, we
              check the GGUF format and save a local checksum.
            </Text>
            {footer}
            <Button
              label={working ? 'Preparing download…' : 'Download model'}
              colors={colors}
              disabled={!url.trim() || working}
              icon="download"
              onPress={() =>
                run(async () => {
                  const version = session.current;
                  const model = fromRemote(name, url, sha);
                  model.byteSize = await probeSize(model.url);
                  if (version !== session.current) return false;
                  return controller.addRemote(model);
                })
              }
            />
          </ScrollView>
        ) : null}
      </View>
    </Sheet>
  );
}
const s = StyleSheet.create({
  panel: { flexShrink: 1 },
  empty: { paddingVertical: 24 },
  chipText: { fontSize: 13 },
  filterPanel: { maxHeight: 230 },
  disabled: { opacity: 0.5 },
  footer: { paddingTop: 12, gap: 8 },
  body: { gap: 16, paddingBottom: 20 },
  grow: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderRadius: 18,
  },
  entryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 48,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, minHeight: 52 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  repo: {
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  repoName: { fontSize: 18, fontWeight: '600', lineHeight: 25 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  badge: {
    fontSize: 11,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  spinner: { padding: 18 },
  error: { gap: 12, paddingVertical: 12 },
  back: { flexDirection: 'row', alignItems: 'center', marginLeft: -12 },
  title: { fontSize: 25, fontWeight: '600', lineHeight: 32 },
  file: { padding: 16, gap: 10, borderRadius: 16, borderWidth: 1 },
  fileName: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
});
