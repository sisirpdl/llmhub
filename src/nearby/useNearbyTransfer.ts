import { useEffect, useRef, useState } from 'react';
import { AppState, NativeEventEmitter } from 'react-native';
import type { ModelController } from '../app/useModelController';
import type { ModelManifest } from '../models/modelCatalog';
import { files, http, type Peer, type Incoming } from './native';
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
    if (!supported() || busy || working) return;
    setVisible(true);
    setMode('send');
    setReveal(false);
    setDiscoveryError('');
    session.current?.share(model);
  }
  async function openReceive() {
    if (!supported() || busy || working) return;
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
    setKey('');
    setReveal(false);
    setPeers([]);
    await session.current?.stop();
    setVisible(false);
  }
  async function pause() {
    setKey('');
    setReveal(false);
    await session.current?.stop();
  }
  return {
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
    connect: () => session.current?.connect(address, key),
    receive: () => session.current?.receive(),
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
