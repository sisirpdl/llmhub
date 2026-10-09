import { useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter, NativeModules } from 'react-native';
import type { ModelController } from '../app/useModelController';
import type { ModelManifest } from '../models/modelCatalog';
import { files, http, type Peer, type Incoming } from './native';
import { decodePairing } from './pairing';
import { NearbySession, type TransferState } from './session';
export function useNearbyTransfer(models: ModelController) {
  const latest = useRef(models);
  latest.current = models;
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<'send' | 'receive'>('receive');
  const [state, setState] = useState<TransferState>({
    stage: 'idle',
    bytes: 0,
  });
  const [peers, setPeers] = useState<Peer[]>([]);
  const [discoveryError, setDiscoveryError] = useState('');
  const [address, setAddress] = useState('');
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const scanLock = useRef(false);
  const scanGeneration = useRef(0);
  const alive = useRef(true);
  const session = useRef<NearbySession | null>(null);
  if (!session.current && files && http)
    session.current = new NearbySession(
      files,
      http,
      next => {
        if (alive.current) setState(next);
      },
      model => latest.current.registerReceived(model),
    );
  useEffect(() => {
    alive.current = true;
    const subscriptions: { remove(): void }[] = [];
    if (files && http) {
      const transportEvents = new NativeEventEmitter(http as never),
        discoveryEvents = new NativeEventEmitter(files as never);
      subscriptions.push(
        transportEvents.addListener(
          'ModelTransferRequest',
          (request: Incoming) => {
            session.current?.handle(request).catch(() => {});
          },
        ),
      );
      subscriptions.push(
        transportEvents.addListener('ModelTransferStopped', () => {
          session.current?.stop();
        }),
      );
      subscriptions.push(
        discoveryEvents.addListener('TransferPeer', (peer: Peer) => {
          setPeers(current => [...current.filter(p => p.id !== peer.id), peer]);
        }),
      );
      subscriptions.push(
        discoveryEvents.addListener(
          'TransferPeerLost',
          ({ id }: { id: string }) => {
            setPeers(current => current.filter(p => p.id !== id));
          },
        ),
      );
      subscriptions.push(
        discoveryEvents.addListener(
          'TransferDiscoveryError',
          ({ message }: { message: string }) => setDiscoveryError(message),
        ),
      );
    }
    subscriptions.push(
      AppState.addEventListener('change', value => {
        if (value !== 'active') {
          setKey('');
          setReveal(false);
          session.current?.stop();
          setPeers([]);
        }
      }),
    );
    return () => {
      alive.current = false;
      subscriptions.forEach(subscription => subscription.remove());
      session.current?.stop();
    };
  }, []);
  const busy = !['idle', 'done', 'paused', 'error'].includes(state.stage);
  const working = [
    'preparing',
    'connecting',
    'receiving',
    'verifying',
    'stopping',
  ].includes(state.stage);
  function supported() {
    if (!session.current) {
      models.setNotice('Nearby sharing needs a new native build of the app.');
      return false;
    }
    if (
      models.generationActive ||
      models.importing ||
      Object.values(models.states).some(value =>
        ['checking', 'loading', 'downloading', 'validating'].includes(value),
      )
    ) {
      models.setNotice(
        'Finish the current model operation or stop LAN hosting before sharing.',
      );
      return false;
    }
    return true;
  }
  function send(model: ModelManifest) {
    if (scanLock.current || !supported() || busy || working) return;
    setVisible(true);
    setMode('send');
    setReveal(false);
    setDiscoveryError('');
    session.current?.share(model);
  }
  async function openReceive() {
    if (scanLock.current || !supported() || busy || working) return;
    setVisible(true);
    setMode('receive');
    setPeers([]);
    setDiscoveryError('');
    await files
      ?.discover()
      .catch(() =>
        setDiscoveryError(
          'Discovery unavailable. Enter the sender’s address manually.',
        ),
      );
  }
  async function close() {
    scanGeneration.current++;
    setScanError('');
    setKey('');
    setReveal(false);
    setPeers([]);
    await session.current?.stop();
    setVisible(false);
  }
  async function pause() {
    scanGeneration.current++;
    setKey('');
    setReveal(false);
    await session.current?.stop();
  }
  async function scan() {
    if (scanLock.current || working || mode !== 'receive') return;
    const native = NativeModules.NearbyQrScanner as
      | { scan(): Promise<string | null> }
      | undefined;
    if (!native || typeof native.scan !== 'function') {
      setScanError(
        'Scanning needs a new native build. You can still enter the address and key manually.',
      );
      return;
    }
    const generation = ++scanGeneration.current;
    scanLock.current = true;
    setScanning(true);
    setScanError('');
    try {
      // Camera permission/scanner presentation may pause the app. Retire old pairing first.
      await session.current?.stop();
      const value = await native.scan();
      if (!value || !alive.current || generation !== scanGeneration.current)
        return;
      const pairing = decodePairing(value);
      await foregroundForScan();
      await session.current?.stop();
      if (!alive.current || generation !== scanGeneration.current) return;
      setAddress(pairing.address);
      setKey(pairing.key);
      // Pairing only reads the offered model. File transfer still requires explicit acceptance.
      await session.current?.connect(pairing.address, pairing.key);
    } catch (error) {
      if (alive.current && generation === scanGeneration.current)
        setScanError(
          error instanceof Error
            ? error.message
            : 'Unable to scan. Check camera access or use manual pairing.',
        );
    } finally {
      scanLock.current = false;
      if (alive.current) setScanning(false);
    }
  }
  return {
    scanning,
    scanError,
    scan,
    visible,
    mode,
    state,
    busy,
    working,
    peers,
    discoveryError,
    address,
    setAddress,
    key,
    setKey,
    reveal,
    setReveal,
    send,
    openReceive,
    close,
    pause,
    connect: () => !scanLock.current && session.current?.connect(address, key),
    receive: () => !scanLock.current && session.current?.receive(),
    discard: async () => {
      try {
        await session.current?.discard();
      } catch (error) {
        models.setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to delete partial files.',
        );
      }
    },
  };
}
export type NearbyTransfer = ReturnType<typeof useNearbyTransfer>;

// Android returns an Activity result before React Native's foreground event on some phones.
async function foregroundForScan(): Promise<void> {
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve, reject) => {
    const listener = AppState.addEventListener('change', value => {
      if (value === 'active') {
        clearTimeout(timer);
        listener.remove();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      listener.remove();
      reject(new Error('Return to LLMHub and scan again.'));
    }, 3000);
  });
}
