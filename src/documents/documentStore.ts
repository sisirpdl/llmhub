import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import RNFS from 'react-native-fs';
import {
  chunkMarkdown,
  type DocumentChunk,
  type DocumentRecord,
} from './documentIndex';

export type PickedTextDocument = {
  uri: string;
  name: string;
  size: number | null;
};

const KEY = '@llmhub/documents-v1';
const DIRECTORY = `${RNFS.DocumentDirectoryPath}/documents`;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

function isSupportedName(name: string): boolean {
  return /\.(md|markdown|txt)$/i.test(name);
}

function isDocument(value: unknown): value is DocumentRecord {
  const document = value as Partial<DocumentRecord>;
  return Boolean(
    document &&
      typeof document.id === 'string' &&
      /^document-[a-z0-9-]+$/i.test(document.id) &&
      typeof document.name === 'string' &&
      typeof document.path === 'string' &&
      document.path.startsWith(`${DIRECTORY}/`) &&
      typeof document.contentHash === 'string' &&
      /^[a-f0-9]{64}$/i.test(document.contentHash) &&
      Number.isFinite(document.size) &&
      Number.isFinite(document.importedAt),
  );
}

export async function readDocuments(): Promise<DocumentRecord[]> {
  const value = await AsyncStorage.getItem(KEY);
  if (!value) return [];
  const data: unknown = JSON.parse(value);
  if (!Array.isArray(data) || !data.every(isDocument))
    throw new Error('Saved documents could not be restored.');
  return data;
}

async function saveDocuments(documents: DocumentRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(documents));
}

export async function pickTextDocument(): Promise<PickedTextDocument | null> {
  const { pick, types, isErrorWithCode, errorCodes } = await import(
    '@react-native-documents/picker'
  );
  try {
    const [file] = await pick({
      type: [types.allFiles],
      allowMultiSelection: false,
      mode: 'import',
    });
    if (!file.name || !isSupportedName(file.name) || file.isVirtual)
      throw new Error('Choose a local Markdown or text file.');
    return { uri: file.uri, name: file.name, size: file.size };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
}

export async function importTextDocument(
  picked: PickedTextDocument,
): Promise<DocumentRecord> {
  if (!isSupportedName(picked.name))
    throw new Error('Choose a Markdown or text file.');
  if (picked.size && picked.size > MAX_TEXT_BYTES)
    throw new Error('This document is larger than the 10 MB text limit.');
  await RNFS.mkdir(DIRECTORY);
  const id = `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${id}${picked.name.toLowerCase().endsWith('.md') ? '.md' : '.txt'}`;
  const finalPath = `${DIRECTORY}/${fileName}`;
  let copiedPath = '';
  try {
    const { keepLocalCopy } = await import('@react-native-documents/picker');
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName }],
      destination: 'cachesDirectory',
    });
    if (copy.status !== 'success')
      throw new Error(copy.copyError || 'The document could not be copied.');
    copiedPath = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
    const size = Number((await RNFS.stat(copiedPath)).size);
    if (size > MAX_TEXT_BYTES) throw new Error('This document is larger than the 10 MB text limit.');
    const content = await RNFS.readFile(copiedPath, 'utf8');
    if (!content.trim()) throw new Error('The selected document is empty.');
    const contentHash = (await RNBlobUtil.fs.hash(copiedPath, 'sha256')).toLowerCase();
    await RNFS.moveFile(copiedPath, finalPath);
    const document: DocumentRecord = {
      id,
      name: picked.name,
      path: finalPath,
      contentHash,
      size,
      importedAt: Date.now(),
    };
    const existing = await readDocuments();
    await saveDocuments([...existing, document]);
    return document;
  } catch (error) {
    if (copiedPath && (await RNFS.exists(copiedPath))) await RNFS.unlink(copiedPath).catch(() => {});
    if (await RNFS.exists(finalPath)) await RNFS.unlink(finalPath).catch(() => {});
    throw error;
  }
}

export async function deleteDocument(document: DocumentRecord): Promise<void> {
  if (await RNFS.exists(document.path)) await RNFS.unlink(document.path);
  const documents = await readDocuments();
  await saveDocuments(documents.filter(item => item.id !== document.id));
}

export async function loadDocumentChunks(
  documents: DocumentRecord[],
): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];
  for (const document of documents) {
    if (!(await RNFS.exists(document.path))) continue;
    const content = await RNFS.readFile(document.path, 'utf8');
    chunks.push(...chunkMarkdown(document, content));
  }
  return chunks;
}
