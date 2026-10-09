import { lanAddress } from '../lan/protocol';
export type Pairing = { address: string; key: string };
const PREFIX = 'llmhub://nearby/v1?';
export function encodePairing(address: string, key: string): string {
  const normalized = lanAddress(address);
  if (!/^[a-f0-9]{48}$/.test(key)) throw new Error('Invalid pairing key.');
  return `${PREFIX}address=${encodeURIComponent(normalized)}&key=${key}`;
}
export function decodePairing(value: unknown): Pairing {
  try {
    if (
      typeof value !== 'string' ||
      value.length > 512 ||
      !value.startsWith(PREFIX)
    )
      throw new Error();
    const match = /^address=([^&]+)&key=([a-f0-9]{48})$/.exec(
      value.slice(PREFIX.length),
    );
    if (!match) throw new Error();
    return { address: lanAddress(decodeURIComponent(match[1])), key: match[2] };
  } catch {
    throw new Error(
      'This is not an LLMHub nearby pairing QR code. Ask the sender to show their current code.',
    );
  }
}
