import { NativeModules } from 'react-native';
export type Host = { url: string; token: string; session: string };
export type Incoming = {
  session: string;
  id: string;
  method: string;
  path: string;
  body: string;
};
export type Peer = { id: string; name: string; url: string };
export interface TransferFiles {
  pairing(): Promise<{ secret: string; authorization: string }>;
  auth(secret: string): Promise<string>;
  sealText(text: string, secret: string, aad: string): Promise<string>;
  openText(text: string, secret: string, aad: string): Promise<string>;
  readChunk(
    path: string,
    offset: number,
    length: number,
    secret: string,
    aad: string,
  ): Promise<string>;
  writeChunk(
    path: string,
    offset: number,
    text: string,
    secret: string,
    aad: string,
  ): Promise<number>;
  advertise(name: string, port: number): Promise<void>;
  discover(): Promise<void>;
  stopNearby(): Promise<void>;
}
export interface TransferHttp {
  startWithAuthorization(port: number, authorization: string): Promise<Host>;
  stop(): Promise<void>;
  respond(id: string, status: number, body: string): Promise<void>;
  request(
    id: string,
    url: string,
    token: string,
    method: string,
    body: string,
  ): Promise<{ status: number; body: string }>;
  cancel(id: string): void;
}
export const files: TransferFiles | undefined =
  NativeModules.ModelTransferFiles;
export const http: TransferHttp | undefined = NativeModules.ModelTransferHttp;
