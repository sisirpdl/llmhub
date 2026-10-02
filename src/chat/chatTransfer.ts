import RNFS from 'react-native-fs';
import {
  MAX_CHAT_BYTES,
  parseChat,
  portableDocument,
  type ChatDocument,
} from './chatDocument';
import { newId } from './conversationStore';
import { removeChatImages } from './attachments';
const imagePattern =
  /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const ownImage = (url: string) => {
  const path = pathOf(url);
  const prefix = `${RNFS.DocumentDirectoryPath}/chat-images/`;
  const name = path.slice(prefix.length);
  return (
    path.startsWith(prefix) &&
    /^[A-Za-z0-9_-]+\.(png|jpe?g|webp|heic)$/i.test(name)
  );
};
export const wasCancelled = (e: unknown) => {
  const { isErrorWithCode, errorCodes } =
    require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
  return isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED;
};
function pathOf(uri: string) {
  return uri.startsWith('file://') ? decodeURIComponent(uri.slice(7)) : uri;
}
export async function exportChat(
  doc: ChatDocument,
  title: string,
): Promise<boolean> {
  const { saveDocuments } =
    require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
  const output = JSON.parse(
    JSON.stringify(portableDocument(doc)),
  ) as ChatDocument;
  let imageBytes = 0;
  for (const message of output.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== 'image_url' || !part.image_url) continue;
      const url = part.image_url.url;
      if (!url.startsWith('file://')) continue;
      if (!ownImage(url))
        throw new Error(
          'This chat contains an unavailable image. Export cannot read files outside chat storage.',
        );
      const path = pathOf(url);
      const size = Number((await RNFS.stat(path)).size);
      imageBytes += size;
      if ((imageBytes * 4) / 3 > MAX_CHAT_BYTES)
        throw new Error(
          'Images make this export larger than the 32 MiB limit.',
        );
      const ext = path.split('.').pop()?.toLowerCase();
      const mime =
        ext === 'png'
          ? 'png'
          : ext === 'webp'
          ? 'webp'
          : ['jpg', 'jpeg'].includes(ext || '')
          ? 'jpeg'
          : null;
      if (!mime)
        throw new Error(
          'Export supports PNG, JPEG and WebP images. Convert this image before exporting.',
        );
      part.image_url.url = `data:image/${mime};base64,${await RNFS.readFile(
        path,
        'base64',
      )}`;
    }
  }
  const text = JSON.stringify(output, null, 2);
  if (text.length > MAX_CHAT_BYTES)
    throw new Error('Chat files must be smaller than 32 MiB.');
  const directory = `${RNFS.CachesDirectoryPath}/chat-exports/${newId()}`;
  const fileName = `${
    title.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'chat'
  }.json`;
  const path = `${directory}/${fileName}`;
  try {
    await RNFS.mkdir(directory);
    await RNFS.writeFile(path, text, 'utf8');
    if (Number((await RNFS.stat(path)).size) > MAX_CHAT_BYTES)
      throw new Error('Chat files must be smaller than 32 MiB.');
    const [result] = await saveDocuments({
      sourceUris: [`file://${path}`],
      mimeType: 'application/json',
      fileName,
      copy: true,
    });
    if (result.error)
      throw new Error('The chat could not be saved. Try another destination.');
    return true;
  } catch (e) {
    if (wasCancelled(e)) return false;
    throw e;
  } finally {
    await RNFS.unlink(directory).catch(() => {});
  }
}
export async function importChatFile(): Promise<{
  document: ChatDocument;
  images: string[];
} | null> {
  const { pick, keepLocalCopy } =
    require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
  let copy: string | undefined;
  const images: string[] = [];
  try {
    // Some Android providers label JSON as plain text or octet-stream. Validate bytes, not MIME alone.
    const [selected] = await pick({
      type: ['*/*'],
      mode: 'import',
      allowMultiSelection: false,
    });
    if (selected.size !== null && selected.size > MAX_CHAT_BYTES)
      throw new Error('Chat files must be smaller than 32 MiB.');
    const [result] = await keepLocalCopy({
      destination: 'cachesDirectory',
      files: [{ uri: selected.uri, fileName: `chat-import-${newId()}.json` }],
    });
    if (result.status !== 'success' || !result.localUri)
      throw new Error('Unable to read the selected file.');
    copy = pathOf(result.localUri);
    if (Number((await RNFS.stat(copy)).size) > MAX_CHAT_BYTES)
      throw new Error('Chat files must be smaller than 32 MiB.');
    const document = parseChat(await RNFS.readFile(copy, 'utf8'));
    // Imported local paths must never authorize reading arbitrary files on this device.
    for (const m of document.messages)
      if (Array.isArray(m.content))
        for (const part of m.content) {
          if (part.type === 'image_url' && part.image_url) {
            const url = part.image_url.url;
            if (url.startsWith('https://')) continue; // Preserved only; neither rendering nor inference fetches it.
            const match = url.match(imagePattern);
            if (!match)
              throw new Error(
                'Images must be inline PNG/JPEG/WebP data URLs or HTTPS references. Local file paths cannot be imported.',
              );
          } else if (part.type === 'input_audio' || part.type === 'file') {
            // Preserve portable future parts, but forbid local path references.
            if (/"(?:file|content):\/\//i.test(JSON.stringify(part)))
              throw new Error(
                'Local media paths cannot be imported. Use inline media data.',
              );
          }
        }
    for (const m of document.messages)
      if (Array.isArray(m.content))
        for (const part of m.content) {
          if (part.type !== 'image_url' || !part.image_url) continue;
          const match = part.image_url.url.match(imagePattern);
          if (!match) continue;
          const directory = `${RNFS.DocumentDirectoryPath}/chat-images`;
          const path = `${directory}/${newId()}.${
            match[1] === 'jpeg' ? 'jpg' : match[1]
          }`;
          images.push(`file://${path}`);
          await RNFS.mkdir(directory);
          await RNFS.writeFile(path, match[2], 'base64');
          part.image_url.url = `file://${path}`;
        }
    return { document, images };
  } catch (e) {
    await removeChatImages(images);
    if (wasCancelled(e)) return null;
    throw e;
  } finally {
    if (copy) await RNFS.unlink(copy).catch(() => {});
  }
}
