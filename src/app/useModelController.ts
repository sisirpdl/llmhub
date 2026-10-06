import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { getBackendDevicesInfo, initLlama, type LlamaContext } from 'llama.rn';
import RNFS from 'react-native-fs';
import RNBlobUtil from 'react-native-blob-util';
import {
  readImportedModels,
  saveImportedModels,
  isImported,
  downloadImport,
  discardImport,
  importLocal,
  type ImportedModel,
  type PickedGGUF,
} from '../models/importedModels';
import {
  SUPPORTED_MODELS,
  isValidManifest,
  type ModelManifest,
} from '../models/modelCatalog';
import {
  SUPPORTED_VISION_MODELS,
  isVisionManifest,
  type VisionManifest,
} from '../models/visionCatalog';
import {
  artifactPath,
  deleteModel,
  downloadModel,
  downloadVerifiedArtifact,
  getAvailableSpace,
  isModelReady,
  modelPath,
} from '../models/modelStore';
export type ModelState =
  | 'checking'
  | 'not-downloaded'
  | 'downloading'
  | 'validating'
  | 'ready'
  | 'loading'
  | 'active'
  | 'failed'
  | 'load-failed';
export const CATALOG: (ModelManifest | VisionManifest)[] = [
  ...SUPPORTED_MODELS,
  ...SUPPORTED_VISION_MODELS,
];
export const isVision = (model: ModelManifest): model is VisionManifest =>
  'kind' in model && model.kind === 'vision';

export function useModelController(options?: {
  contextLengthFor?: (model: ModelManifest) => number;
}) {
  const [customModels, setCustomModels] = useState<ImportedModel[]>([]);
  const customRef = useRef<ImportedModel[]>([]);
  const catalog = [...CATALOG, ...customModels];
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState(CATALOG[0].id);
  const [states, setStates] = useState<Record<string, ModelState>>({});
  const [progress, setProgress] = useState<
    Record<string, { bytes: number; total: number }>
  >({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [loadedContextLength, setLoadedContextLength] = useState<number | null>(
    null,
  );
  const externalUI = useRef(false);
  const [context, setContext] = useState<LlamaContext | null>(null);
  const [engineStatus, setEngineStatus] = useState('Checking');
  const [loadDuration, setLoadDuration] = useState<number | null>(null);
  const [completionDuration, setCompletionDuration] = useState<number | null>(
    null,
  );
  const [generationActive, setGenerationActive] = useState(false);
  const active = useRef<{ context: LlamaContext; id: string } | null>(null);
  const busy = useRef(false);
  const [hfToken, updateHfToken] = useState('');
  const hfTokenRef = useRef('');
  function setHfToken(value: string) {
    hfTokenRef.current = value.trim();
    updateHfToken(hfTokenRef.current);
  }
  const releasing = useRef<Promise<void> | null>(null);
  const operation = useRef(0);
  const foreground = useRef(
    AppState.currentState === 'active' || AppState.currentState == null,
  );
  const model = catalog.find(item => item.id === selectedId) || CATALOG[0];
  const setState = useCallback(
    (id: string, state: ModelState) =>
      setStates(current => ({ ...current, [id]: state })),
    [],
  );
  const refreshStorage = useCallback(async () => {
    try {
      setFreeSpace(await getAvailableSpace());
    } catch {
      setFreeSpace(null);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    refreshStorage();
    getBackendDevicesInfo()
      .then(() => {
        if (!disposed) setEngineStatus('Available');
      })
      .catch(() => {
        if (!disposed) setEngineStatus('Check on model load');
      });
    async function restoreCatalog() {
      let imported: ImportedModel[] = [];
      try {
        imported = await readImportedModels();
      } catch {
        if (!disposed)
          setNotice(
            'Saved model imports could not be restored. Built-in models are still available.',
          );
      }
      if (disposed) return;
      customRef.current = imported;
      setCustomModels(imported);
      await Promise.all(
        [...CATALOG, ...imported].map(async item => {
          let ready = await isModelReady(item);
          if (ready && isVision(item)) {
            const path = artifactPath(item.projectorFileName);
            ready = await RNFS.exists(path);
            if (ready) {
              const stats = await RNFS.stat(path).catch(() => null);
              ready = Number(stats?.size) === item.projectorByteSize;
              if (ready)
                ready =
                  (
                    await RNBlobUtil.fs.hash(path, 'sha256').catch(() => '')
                  ).toLowerCase() === item.projectorSha256.toLowerCase();
            }
          }
          if (!disposed) setState(item.id, ready ? 'ready' : 'not-downloaded');
        }),
      );
    }
    restoreCatalog().catch(() => {
      if (!disposed)
        setNotice(
          'Model files could not be checked. Restart the app to retry.',
        );
    });
    return () => {
      disposed = true;
    };
  }, [refreshStorage, setState]);

  const offload = useCallback(async () => {
    if (releasing.current) return releasing.current;
    const previous = active.current;
    if (!previous) return;
    active.current = null;
    setContext(null);
    setLoadedContextLength(null);
    const release = async () => {
      try {
        await previous.context.stopCompletion();
      } catch {
        // Continue releasing the context if stopping fails.
      }
      await previous.context.release().catch(() => {});
      setState(previous.id, 'ready');
    };
    releasing.current = release();
    try {
      await releasing.current;
    } finally {
      releasing.current = null;
    }
  }, [setState]);

  useEffect(() => {
    const background = AppState.addEventListener('change', next => {
      foreground.current = next === 'active';
      if (next !== 'active' && !externalUI.current) {
        operation.current += 1;
        if (active.current) {
          setNotice(
            'The model was unloaded when the app left the foreground. Load it again to continue.',
          );
          offload();
        }
      } else {
        refreshStorage();
      }
    });
    const memory = AppState.addEventListener('memoryWarning', () => {
      operation.current += 1;
      setNotice(
        'The model was unloaded to recover memory. Load it again to continue.',
      );
      offload();
    });
    return () => {
      background.remove();
      memory.remove();
    };
  }, [offload, refreshStorage]);

  async function saveCustom(items: ImportedModel[]) {
    await saveImportedModels(items);
    customRef.current = items;
    setCustomModels(items);
  }

  async function download(item: ModelManifest, token = '') {
    const accessToken = token.trim() || hfTokenRef.current;
    if (busy.current || generationActive) return;
    if (
      !isImported(item) &&
      (!isValidManifest(item) || (isVision(item) && !isVisionManifest(item)))
    ) {
      setErrors(current => ({
        ...current,
        [item.id]: 'This model has incomplete compatibility metadata.',
      }));
      return;
    }
    busy.current = true;
    setErrors(current => ({ ...current, [item.id]: '' }));
    setProgress(current => ({
      ...current,
      [item.id]: {
        bytes: 0,
        total: item.byteSize + (isVision(item) ? item.projectorByteSize : 0),
      },
    }));
    setState(item.id, 'downloading');
    const total = item.byteSize + (isVision(item) ? item.projectorByteSize : 0);
    try {
      if ((await getAvailableSpace()) < total + 256 * 1024 ** 2)
        throw new Error('Not enough storage. Free some space and retry.');
      if (isImported(item)) {
        const verified = await downloadImport(
          item,
          p => {
            setState(item.id, 'downloading');
            setProgress(current => ({
              ...current,
              [item.id]: { bytes: p.bytesWritten, total: p.totalBytes },
            }));
          },
          () => setState(item.id, 'validating'),
          accessToken,
        );
        try {
          await saveCustom(
            customRef.current.map(current =>
              current.id === item.id ? verified : current,
            ),
          );
        } catch (error) {
          await discardImport(verified).catch(() => {});
          throw error;
        }
      } else {
        await downloadModel(
          item,
          p =>
            setProgress(current => ({
              ...current,
              [item.id]: { bytes: p.bytesWritten, total },
            })),
          () => setState(item.id, 'validating'),
          accessToken,
        );
        if (isVision(item)) {
          setState(item.id, 'downloading');
          await downloadVerifiedArtifact(
            {
              fileName: item.projectorFileName,
              url: item.projectorUrl,
              byteSize: item.projectorByteSize,
              sha256: item.projectorSha256,
            },
            p =>
              setProgress(current => ({
                ...current,
                [item.id]: { bytes: item.byteSize + p.bytesWritten, total },
              })),
            accessToken,
          );
        }
      }
      setState(item.id, 'ready');
    } catch (error) {
      setState(item.id, 'failed');
      setErrors(current => ({
        ...current,
        [item.id]: `${
          error instanceof Error ? error.message : 'Download failed.'
        } Retry restarts the download.`,
      }));
    } finally {
      busy.current = false;
      refreshStorage();
    }
  }

  async function load(
    item: ModelManifest,
    contextOverride?: number,
  ): Promise<boolean> {
    if (busy.current || generationActive || !foreground.current) return false;
    busy.current = true;
    const version = ++operation.current;
    setErrors(current => ({ ...current, [item.id]: '' }));
    let next: LlamaContext | null = null;
    try {
      await offload();
      setSelectedId(item.id);
      setState(item.id, 'loading');
      const start = Date.now();
      const contextLength =
        contextOverride ??
        options?.contextLengthFor?.(item) ??
        item.recommendedContextLength;
      if (
        !Number.isInteger(contextLength) ||
        contextLength < 512 ||
        contextLength > 8192
      )
        throw new Error('Choose a context length between 512 and 8192.');
      next = await initLlama({
        model: modelPath(item),
        n_ctx: contextLength,
      });
      if (
        isVision(item) &&
        !(await next.initMultimodal({
          path: artifactPath(item.projectorFileName),
          image_max_tokens: 512,
        }))
      )
        throw new Error('The vision projector could not be loaded.');
      setLoadDuration(Date.now() - start);
      const smokeStart = Date.now();
      const result = await next.completion({
        messages: [{ role: 'user', content: 'Reply with exactly: READY' }],
        n_predict: 8,
        temperature: 0,
      });
      setCompletionDuration(Date.now() - smokeStart);
      if (!result.text.trim())
        throw new Error('The model returned no text. Try loading it again.');
      if (version !== operation.current || !foreground.current) {
        await next.release();
        next = null;
        setState(item.id, 'ready');
        setNotice(
          'Loading was interrupted. Return to the app and load the model again.',
        );
        return false;
      }
      active.current = { context: next, id: item.id };
      setContext(next);
      setLoadedContextLength(contextLength);
      next = null;
      setState(item.id, 'active');
      setNotice('');
      return true;
    } catch (error) {
      if (next) await next.release().catch(() => {});
      setState(item.id, 'load-failed');
      setErrors(current => ({
        ...current,
        [item.id]:
          error instanceof Error
            ? error.message
            : 'Unable to load this model. Retry or choose a smaller model.',
      }));
      return false;
    } finally {
      busy.current = false;
    }
  }

  function remove(item: ModelManifest) {
    if (generationActive || busy.current) {
      setNotice(
        'Stop generation or wait for the current operation before deleting a model.',
      );
      return;
    }
    Alert.alert(
      'Delete model?',
      `Remove ${item.displayName} from this device? Your conversations will be kept.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (busy.current) return;
            busy.current = true;
            try {
              if (active.current?.id === item.id) await offload();
              await deleteModel(item);
              if (isVision(item)) {
                for (const file of [
                  artifactPath(item.projectorFileName),
                  `${artifactPath(item.projectorFileName)}.part`,
                ]) {
                  if (await RNFS.exists(file)) await RNFS.unlink(file);
                }
              }
              if (isImported(item)) {
                await saveCustom(
                  customRef.current.filter(current => current.id !== item.id),
                );
                setStates(current => {
                  const updated = { ...current };
                  delete updated[item.id];
                  return updated;
                });
              } else setState(item.id, 'not-downloaded');
            } catch (error) {
              setErrors(current => ({
                ...current,
                [item.id]:
                  error instanceof Error
                    ? error.message
                    : 'Unable to delete the model.',
              }));
            } finally {
              busy.current = false;
              refreshStorage();
            }
          },
        },
      ],
    );
  }
  async function addRemote(item: ImportedModel, token = ''): Promise<boolean> {
    if (busy.current || generationActive) {
      setNotice('Wait for the current model operation to finish.');
      return false;
    }
    const existing = customRef.current.find(
      current =>
        current.url &&
        current.url === item.url &&
        ((!isVision(current) && !isVision(item)) ||
          (isVision(current) &&
            isVision(item) &&
            current.projectorUrl === item.projectorUrl)),
    );
    if (
      existing &&
      ['ready', 'active', 'loading'].includes(states[existing.id])
    ) {
      setNotice('This model file is already in your library.');
      return true;
    }
    const target = existing || item;
    if (!existing) await saveCustom([...customRef.current, target]);
    if (token.trim()) setHfToken(token);
    download(target, token).catch(() =>
      setNotice('Unable to start this download. Try again.'),
    );
    return true;
  }
  async function addLocal(
    file: PickedGGUF,
    projector?: PickedGGUF,
  ): Promise<boolean> {
    if (busy.current || generationActive)
      throw new Error(
        'Wait for the current operation or stop generation first.',
      );
    busy.current = true;
    setImporting(true);
    try {
      const imported = await importLocal(file, projector);
      try {
        await saveCustom([...customRef.current, imported]);
      } catch (error) {
        await discardImport(imported).catch(() => {});
        throw error;
      }
      setState(imported.id, 'ready');
      return true;
    } finally {
      busy.current = false;
      setImporting(false);
      refreshStorage();
    }
  }
  function setExternalUIActive(value: boolean) {
    externalUI.current = value;
    if (!value && !foreground.current) offload();
  }
  async function registerReceived(item: ImportedModel) {
    if (busy.current)
      throw new Error('Another model operation is still running.');
    await saveCustom([
      ...customRef.current.filter(value => value.id !== item.id),
      item,
    ]);
    setState(item.id, 'ready');
    refreshStorage();
  }
  return {
    registerReceived,
    hfToken,
    setHfToken,
    loadedContextLength,
    setExternalUIActive,
    catalog,
    importing,
    addRemote,
    addLocal,
    model,
    states,
    progress,
    errors,
    notice,
    setNotice,
    freeSpace,
    context,
    engineStatus,
    loadDuration,
    completionDuration,
    generationActive,
    setGenerationActive,
    download,
    load,
    offload,
    remove,
  };
}
export type ModelController = ReturnType<typeof useModelController>;
