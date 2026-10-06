import { lanAddress } from '../lan/protocol';
import type { ModelManifest } from '../models/modelCatalog';
import type { ImportedModel } from '../models/importedModels';
import type { Incoming, TransferFiles, TransferHttp, Host } from './native';
import {
  CHUNK_BYTES,
  PORT,
  chunkAAD,
  controlAAD,
  checkChunk,
  identifier,
  parseOffer,
  totalBytes,
  type Offer,
} from './protocol';
import * as storage from './storage';
export type Stage =
  | 'idle'
  | 'preparing'
  | 'sharing'
  | 'connecting'
  | 'preview'
  | 'receiving'
  | 'verifying'
  | 'paused'
  | 'done'
  | 'stopping'
  | 'error';
export type TransferState = {
  stage: Stage;
  error?: string;
  offer?: Offer;
  bytes: number;
  host?: Host;
  secret?: string;
};
type Connection = {
  url: string;
  secret: string;
  token: string;
  receiver: string;
  offer: Offer;
};
type Sharing = {
  host: Host;
  secret: string;
  offer: Offer;
  paths: string[];
  receiver?: string;
};
type Message = {
  action: string;
  receiver: string;
  offer?: string;
  artifact?: number;
  offset?: number;
  length?: number;
};
export class NearbySession {
  state: TransferState = { stage: 'idle', bytes: 0 };
  private generation = 0;
  private counter = 0;
  private task: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private incomingBusy = false;
  private completed = false;
  private sharing: Sharing | null = null;
  private connection: Connection | null = null;
  private requests = new Set<string>();
  constructor(
    private files: TransferFiles,
    private http: TransferHttp,
    private changed: (state: TransferState) => void,
    private register: (model: ImportedModel) => Promise<void>,
  ) {}
  private update(change: Partial<TransferState>) {
    this.state = { ...this.state, ...change };
    this.changed(this.state);
  }
  private valid(epoch: number) {
    return this.generation === epoch;
  }
  private guard(epoch: number) {
    if (!this.valid(epoch)) throw new Error('Transfer paused.');
  }
  private run(
    stage: Stage,
    operation: (epoch: number) => Promise<void>,
  ): Promise<void> {
    if (this.task || this.stopping || this.sharing) return Promise.resolve();
    const epoch = ++this.generation;
    this.completed = false;
    this.update({ stage, error: undefined });
    const task = operation(epoch)
      .catch(error => {
        if (this.valid(epoch))
          this.update({
            stage: 'error',
            error: error instanceof Error ? error.message : 'Transfer failed.',
          });
      })
      .finally(() => {
        if (this.task === task) this.task = null;
      });
    this.task = task;
    return task;
  }
  async share(model: ModelManifest) {
    return this.run('preparing', async epoch => {
      const pairing = await this.files.pairing();
      this.guard(epoch);
      const offerId = (await this.files.pairing()).secret;
      this.guard(epoch);
      const { offer, paths } = await storage.makeOffer(model, offerId);
      this.guard(epoch);
      let host: Host | undefined;
      try {
        host = await this.http.startWithAuthorization(
          PORT,
          pairing.authorization,
        );
        this.guard(epoch);
        this.sharing = { host, secret: pairing.secret, offer, paths };
        await this.files
          .advertise(`LLMHub ${offerId.slice(0, 6)}`, PORT)
          .catch(() => {});
        this.guard(epoch);
        this.update({
          stage: 'sharing',
          bytes: 0,
          offer,
          host,
          secret: pairing.secret,
        });
      } catch (error) {
        this.sharing = null;
        if (host) await this.http.stop().catch(() => {});
        await this.files.stopNearby().catch(() => {});
        throw error;
      }
    });
  }
  async connect(address: string, key: string) {
    return this.run('connecting', async epoch => {
      const url = lanAddress(address),
        secret = key.trim().toLowerCase();
      if (!/^[a-f0-9]{48}$/.test(secret))
        throw new Error(
          'Enter the sender’s complete 48-character pairing key.',
        );
      const token = await this.files.auth(secret);
      this.guard(epoch);
      // Reconnecting to the same active host retains ownership. Fresh pairing gets a new ID.
      const receiver =
        this.connection?.url === url && this.connection.secret === secret
          ? this.connection.receiver
          : (await this.files.pairing()).secret;
      this.guard(epoch);
      const connection = {
        url,
        secret,
        token,
        receiver,
        offer: null as unknown as Offer,
      };
      const data = await this.exchange(
        connection,
        { action: 'offer', receiver },
        epoch,
      );
      const offer = parseOffer(data.offer);
      this.guard(epoch);
      this.connection = { ...connection, offer };
      const partial = await storage.loadCheckpoint();
      this.guard(epoch);
      const bytes =
        partial && storage.fingerprintCompatible(partial.offer, offer)
          ? (await storage.offsets(partial)).reduce((a, b) => a + b, 0)
          : 0;
      this.guard(epoch);
      this.update({
        stage: 'preview',
        offer,
        bytes,
        host: undefined,
        secret: undefined,
      });
    });
  }
  async receive() {
    const connection = this.connection;
    if (!connection) return;
    return this.run('receiving', async epoch => {
      const checkpoint = await storage.prepare(connection.offer);
      this.guard(epoch);
      const positions = await storage.offsets(checkpoint);
      this.guard(epoch);
      let bytes = positions.reduce((a, b) => a + b, 0);
      this.update({ bytes });
      await this.exchange(
        connection,
        {
          action: 'accept',
          receiver: connection.receiver,
          offer: connection.offer.id,
        },
        epoch,
      );
      for (const [index, artifact] of connection.offer.artifacts.entries()) {
        let offset = positions[index];
        while (offset < artifact.size) {
          this.guard(epoch);
          const length = Math.min(CHUNK_BYTES, artifact.size - offset);
          const result = await this.exchange(
            connection,
            {
              action: 'chunk',
              receiver: connection.receiver,
              offer: connection.offer.id,
              artifact: index,
              offset,
              length,
            },
            epoch,
          );
          if (
            typeof result.chunk !== 'string' ||
            typeof result.requestId !== 'string'
          )
            throw new Error('Invalid chunk response.');
          this.guard(epoch);
          const written = await this.files.writeChunk(
            storage.partialPath(checkpoint, index),
            offset,
            result.chunk,
            connection.secret,
            chunkAAD(
              connection.offer.id,
              index,
              offset,
              length,
              result.requestId,
            ),
          );
          if (written !== length)
            throw new Error(
              'Unexpected chunk size. Delete the partial transfer before retrying.',
            );
          offset += written;
          bytes += written;
          this.guard(epoch);
          this.update({ bytes });
        }
      }
      this.update({ stage: 'verifying' });
      await storage.finish(checkpoint, this.register, () => this.valid(epoch));
      this.completed = true;
      // This notification is best effort: loss of the sender must not undo a verified import.
      if (this.valid(epoch)) {
        const timer = setTimeout(() => {
          for (const id of this.requests) this.http.cancel(id);
        }, 5000);
        try {
          await this.exchange(
            connection,
            {
              action: 'complete',
              receiver: connection.receiver,
              offer: connection.offer.id,
            },
            epoch,
          ).catch(() => {});
        } finally {
          clearTimeout(timer);
        }
      }
      this.connection = null;
      if (this.valid(epoch))
        this.update({ stage: 'done', bytes: totalBytes(connection.offer) });
    });
  }
  private async exchange(
    connection: Connection,
    message: Message,
    epoch: number,
  ): Promise<Record<string, unknown>> {
    const id = `${connection.receiver}-${++this.counter}`;
    const cipher = await this.files.sealText(
      JSON.stringify(message),
      connection.secret,
      controlAAD('request', id),
    );
    this.guard(epoch);
    this.requests.add(id);
    try {
      const response = await this.http.request(
        id,
        `${connection.url}/transfer`,
        connection.token,
        'POST',
        JSON.stringify({ id, cipher }),
      );
      this.guard(epoch);
      if (response.status !== 200)
        throw new Error(
          'Sender unavailable. Check Wi-Fi and the pairing key; keep both apps open.',
        );
      const envelope = JSON.parse(response.body);
      if (!envelope || typeof envelope.cipher !== 'string')
        throw new Error('Invalid transfer response.');
      const data = JSON.parse(
        await this.files.openText(
          envelope.cipher,
          connection.secret,
          controlAAD('response', id),
        ),
      );
      this.guard(epoch);
      if (typeof data.error === 'string') throw new Error(data.error);
      if (message.action === 'chunk') {
        if (data.requestId !== id || typeof envelope.chunk !== 'string')
          throw new Error('Invalid chunk response.');
        data.chunk = envelope.chunk;
      }
      return data;
    } finally {
      this.requests.delete(id);
    }
  }
  async handle(request: Incoming) {
    const sharing = this.sharing;
    if (!sharing || request.session !== sharing.host.session) return;
    if (
      this.incomingBusy ||
      request.method !== 'POST' ||
      request.path !== '/transfer'
    ) {
      await this.http.respond(request.id, 409, '{}').catch(() => {});
      return;
    }
    this.incomingBusy = true;
    const epoch = this.generation;
    let envelope: { id: string; cipher: string } | undefined;
    try {
      envelope = JSON.parse(request.body);
      if (
        !envelope ||
        !identifier(envelope.id) ||
        typeof envelope.cipher !== 'string'
      )
        throw new Error('Invalid transfer request.');
      const message = JSON.parse(
        await this.files.openText(
          envelope.cipher,
          sharing.secret,
          controlAAD('request', envelope.id),
        ),
      ) as Message;
      this.guard(epoch);
      if (!identifier(message.receiver)) throw new Error('Invalid receiver.');
      let data: Record<string, unknown> = {},
        chunk: string | undefined;
      if (message.action === 'offer') data = { offer: sharing.offer };
      else {
        if (message.offer !== sharing.offer.id)
          throw new Error('Model offer changed. Pair again.');
        if (message.action === 'accept') {
          if (sharing.receiver && sharing.receiver !== message.receiver)
            throw new Error(
              'This sender is already paired with another receiver. Ask the sender to restart sharing.',
            );
          sharing.receiver = message.receiver;
          data = { accepted: true };
        } else {
          if (sharing.receiver !== message.receiver)
            throw new Error('Accept the model before requesting files.');
          if (message.action === 'chunk') {
            const { artifact, offset, length } = message as Message & {
              artifact: number;
              offset: number;
              length: number;
            };
            checkChunk(sharing.offer, artifact, offset, length);
            chunk = await this.files.readChunk(
              sharing.paths[artifact],
              offset,
              length,
              sharing.secret,
              chunkAAD(sharing.offer.id, artifact, offset, length, envelope.id),
            );
            this.guard(epoch);
            data = { requestId: envelope.id };
            const bytes =
              sharing.offer.artifacts
                .slice(0, artifact)
                .reduce((a, b) => a + b.size, 0) +
              offset +
              length;
            this.update({ bytes });
          } else if (message.action === 'complete') {
            data = { complete: true };
            this.completed = true;
            this.update({ stage: 'done' });
          } else throw new Error('Unsupported transfer action.');
        }
      }
      const cipher = await this.files.sealText(
        JSON.stringify(data),
        sharing.secret,
        controlAAD('response', envelope.id),
      );
      this.guard(epoch);
      await this.http.respond(
        request.id,
        200,
        JSON.stringify({ cipher, ...(chunk ? { chunk } : {}) }),
      );
      if (message.action === 'complete') {
        this.sharing = null;
        await this.files.stopNearby().catch(() => {});
        await this.http.stop().catch(() => {});
        this.update({ secret: undefined, host: undefined });
      }
    } catch (error) {
      if (this.valid(epoch) && envelope && identifier(envelope.id)) {
        try {
          const cipher = await this.files.sealText(
            JSON.stringify({
              error:
                error instanceof Error ? error.message : 'Transfer failed.',
            }),
            sharing.secret,
            controlAAD('response', envelope.id),
          );
          await this.http.respond(request.id, 200, JSON.stringify({ cipher }));
        } catch {
          await this.http.respond(request.id, 400, '{}').catch(() => {});
        }
      } else if (this.valid(epoch)) {
        await this.http.respond(request.id, 400, '{}').catch(() => {});
      }
    } finally {
      this.incomingBusy = false;
    }
  }
  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    ++this.generation;
    this.sharing = null;
    this.connection = null;
    this.update({ stage: 'stopping', secret: undefined, host: undefined });
    for (const id of this.requests) this.http.cancel(id);
    const task = Promise.all([
      this.files.stopNearby().catch(() => {}),
      this.http.stop().catch(() => {}),
      this.task,
    ])
      .then(() => {
        this.update({ stage: this.completed ? 'done' : 'paused' });
      })
      .finally(() => {
        this.stopping = null;
      });
    this.stopping = task;
    return task;
  }
  async discard() {
    if (this.task || this.stopping || this.sharing) return;
    await storage.discardPartial();
    this.update({
      bytes: 0,
      error: undefined,
      stage: 'idle',
      offer: undefined,
    });
  }
}
