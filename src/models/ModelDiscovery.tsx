import { GGUFVariants } from './GGUFVariants';
import HubNavigation from './HubNavigation';
import type { HubMode } from './HubNavigation.types';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Platform,
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
  type HubFilters,
  type HubModel,
  type HubSort,
} from './huggingFace';
import {
  fromRemote,
  pickGGUF,
  probeSize,
  type PickedGGUF,
} from './importedModels';
const initial: HubFilters = {
  search: '',
  author: '',
  sort: 'lastModified',
  task: 'text',
  hideGated: false,
  maxParameters: '4B',
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
  const [mode, setMode] = useState<HubMode>('trending');
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState(initial);
  const query = useMemo(
    () => ({
      ...filters,
      sort:
        mode === 'trending'
          ? ('trendingScore' as const)
          : mode === 'popular'
          ? ('downloads' as const)
          : filters.sort,
      limit: mode === 'browse' ? 20 : 10,
    }),
    [filters, mode],
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [token, setToken] = useState('');
  const [models, setModels] = useState<HubModel[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [repository, setRepository] = useState<HubModel | null>(null);
  const [details, setDetails] = useState<HubDetails | null>(null);
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
    setLoadingMore(false);
    if (!repository) {
      setModels([]);
      setNext(null);
    }
    const timer = setTimeout(
      () => {
        const operation = repository
          ? getHubDetails(repository, token, abort.signal).then(value => {
              if (!abort.signal.aborted) {
                setDetails(value);
              }
            })
          : searchHub(query, token, abort.signal).then(value => {
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
  }, [visible, page, query, token, repository, retry]);
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
        Platform.OS === 'ios' && s.iosEntry,
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
    } else setPage('add');
  };
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
      <View
        style={[
          s.panel,
          page !== 'add' && { height: Math.min(height * 0.72, 720) },
        ]}
      >
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
          <View style={s.body}>
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
          </View>
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
              <IconButton
                name="sliders"
                label="Show Hugging Face filters"
                colors={colors}
                onPress={() => setFilterOpen(v => !v)}
              />
            </View>
            <HubNavigation
              mode={mode}
              task={filters.task}
              onMode={setMode}
              onTask={task => setFilters(v => ({ ...v, task }))}
              colors={colors}
            />
            <Text style={[s.small, { color: colors.muted }]}>
              {mode === 'popular'
                ? 'Downloads in the last 30 days'
                : mode === 'trending'
                ? 'Trending GGUF repositories'
                : 'Browse GGUF repositories'}
              {' · '}
              {filters.maxParameters === 'all'
                ? 'Any size'
                : `Up to ${filters.maxParameters || '4B'} parameters`}
            </Text>
            {filterOpen ? (
              <ScrollView
                style={s.filterPanel}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.body}
              >
                <Text style={[s.small, { color: colors.muted }]}>
                  Model size
                </Text>
                <View style={s.wrap}>
                  {(['4B', '8B', 'all'] as const).map(maxParameters =>
                    chip(
                      maxParameters === 'all'
                        ? 'Any size'
                        : `Up to ${maxParameters}`,
                      filters.maxParameters === maxParameters,
                      () => setFilters(v => ({ ...v, maxParameters })),
                    ),
                  )}
                </View>
                <Text style={[s.small, { color: colors.muted }]}>
                  Smaller models are better phone candidates. Check each GGUF
                  variant for estimated RAM fit. Models with unknown parameter
                  counts are excluded from size-limited lists; choose Any size
                  to find them.
                </Text>
                {field('Author / organization', filters.author, author =>
                  setFilters(v => ({ ...v, author })),
                )}
                <View style={s.wrap}>
                  {mode === 'browse'
                    ? sorts.map(([sort, label]) =>
                        chip(label, filters.sort === sort, () =>
                          setFilters(v => ({ ...v, sort })),
                        ),
                      )
                    : null}
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
                    <Text
                      style={[
                        s.badge,
                        {
                          backgroundColor: colors.elevated,
                          color: colors.accent,
                        },
                      ]}
                    >
                      {item.vision ? 'Vision' : 'Text'}
                    </Text>
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
                    label={loadingMore ? 'Loading…' : 'Show more'}
                    disabled={loadingMore}
                    colors={colors}
                    onPress={() => {
                      const abort = request.current;
                      if (!abort) return;
                      setLoadingMore(true);
                      searchHub(query, token, abort.signal, next)
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
                          if (!abort.signal.aborted) setLoadingMore(false);
                        });
                    }}
                  />
                ) : null
              }
            />
          </>
        ) : null}
        {page === 'hub' && repository ? (
          details && !loading ? (
            <GGUFVariants
              details={details}
              token={token}
              controller={controller}
              colors={colors}
              onImported={close}
            />
          ) : (
            <View style={s.body}>
              <Text style={[s.title, { color: colors.text }]}>
                {repository.name}
              </Text>
              {loading ? <ActivityIndicator color={colors.accent} /> : null}
              {footer}
            </View>
          )
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
  iosEntry: { borderRadius: 12, paddingVertical: 14 },
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
