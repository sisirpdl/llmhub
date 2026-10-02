import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import RNFS from 'react-native-fs';
import {
  chunkMarkdown,
  chunkPdfPages,
  type DocumentChunk,
  type DocumentRecord,
} from './documentIndex';
import { extractPdf, checkImport, type ImportControl } from './pdfText';

export type PickedTextDocument = {
  uri: string;
  name: string;
  size: number | null;
};

const KEY = '@llmhub/documents-v1';
const DIRECTORY = `${RNFS.DocumentDirectoryPath}/documents`;
const MAX_TEXT_BYTES = 10 * 1024 * 1024;

function isSupportedName(name: string): boolean {
  return /\.(md|markdown|txt|pdf)$/i.test(name);
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
  const { pick, types, isErrorWithCode, errorCodes } =
    require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
  try {
    const [file] = await pick({
      type: [types.allFiles],
      allowMultiSelection: false,
      mode: 'import',
    });
    if (!file.name || !isSupportedName(file.name) || file.isVirtual)
      throw new Error('Choose a local PDF, Markdown, or text file.');
    return { uri: file.uri, name: file.name, size: file.size };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED)
      return null;
    throw error;
  }
}

const indexPath = (document: { id: string }) =>
  `${DIRECTORY}/${document.id}.index.json`;

export async function importTextDocument(
  picked: PickedTextDocument,
  control?: ImportControl,
): Promise<DocumentRecord> {
  if (!isSupportedName(picked.name))
    throw new Error('Choose a PDF, Markdown, or text file.');
  const pdf = /\.pdf$/i.test(picked.name);
  const maxBytes = pdf ? 50 * 1024 * 1024 : MAX_TEXT_BYTES;
  const limitMessage = pdf
    ? 'PDFs must be smaller than 50 MB.'
    : 'Text documents must be smaller than 10 MB.';
  if (picked.size && picked.size > maxBytes) throw new Error(limitMessage);
  checkImport(control);
  control?.onProgress?.('Copying document…');
  await RNFS.mkdir(DIRECTORY);
  const id = `document-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${id}${pdf ? '.pdf' : '.txt'}`;
  const finalPath = `${DIRECTORY}/${fileName}`;
  let copiedPath = '';
  try {
    const { keepLocalCopy } =
      require('@react-native-documents/picker') as typeof import('@react-native-documents/picker');
    const [copy] = await keepLocalCopy({
      files: [{ uri: picked.uri, fileName }],
      destination: 'cachesDirectory',
    });
    if (copy.status !== 'success')
      throw new Error(copy.copyError || 'The document could not be copied.');
    copiedPath = decodeURIComponent(copy.localUri.replace(/^file:\/\//, ''));
    checkImport(control);
    const size = Number((await RNFS.stat(copiedPath)).size);
    if (!Number.isFinite(size) || size <= 0)
      throw new Error('The selected document is empty.');
    if (size > maxBytes) throw new Error(limitMessage);
    const contentHash = (
      await RNBlobUtil.fs.hash(copiedPath, 'sha256')
    ).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contentHash))
      throw new Error('The document could not be verified.');
    checkImport(control);
    await RNFS.moveFile(copiedPath, finalPath);
    const document: DocumentRecord = {
      id,
      name: picked.name,
      path: finalPath,
      contentHash,
      size,
      importedAt: Date.now(),
      kind: pdf ? 'pdf' : 'text',
    };
    let chunks: DocumentChunk[];
    if (pdf) {
      const pages = await extractPdf(finalPath, control);
      document.pageCount = pages.length;
      document.emptyPages = pages.filter(page => !page.text.trim()).length;
      chunks = chunkPdfPages(document, pages);
    } else {
      const text = await RNFS.readFile(finalPath, 'utf8');
      if (!text.trim()) throw new Error('The selected document is empty.');
      chunks = chunkMarkdown(document, text);
    }
    if (chunks.length > 10000)
      throw new Error(
        'This document contains too many passages. Import a smaller document.',
      );
    checkImport(control);
    control?.onProgress?.('Saving local index…');
    await RNFS.writeFile(
      indexPath(document),
      JSON.stringify({ version: 1, contentHash, chunks }),
      'utf8',
    );
    const existing = await readDocuments();
    checkImport(control);
    await saveDocuments([...existing, document]);
    return document;
  } catch (error) {
    for (const path of [copiedPath, finalPath, indexPath({ id })]) {
      if (path && (await RNFS.exists(path)))
        await RNFS.unlink(path).catch(() => {});
    }
    throw error;
  }
}

export async function deleteDocument(document: DocumentRecord): Promise<void> {
  const documents = await readDocuments();
  await saveDocuments(documents.filter(item => item.id !== document.id));
  for (const path of [document.path, indexPath(document)]) {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  }
}

export async function loadDocumentChunks(
  documents: DocumentRecord[],
): Promise<DocumentChunk[]> {
  const chunks: DocumentChunk[] = [];
  for (const document of documents) {
    if (!(await RNFS.exists(document.path)))
      throw new Error(
        `The file for ${document.name} is missing. Remove and reimport it.`,
      );
    const cache = indexPath(document);
    if (await RNFS.exists(cache)) {
      const index = JSON.parse(await RNFS.readFile(cache, 'utf8'));
      if (
        index.version !== 1 ||
        index.contentHash !== document.contentHash ||
        !Array.isArray(index.chunks) ||
        !index.chunks.every(
          (chunk: DocumentChunk) =>
            chunk &&
            chunk.documentId === document.id &&
            typeof chunk.id === 'string' &&
            typeof chunk.text === 'string' &&
            typeof chunk.documentName === 'string' &&
            Number.isFinite(chunk.start) &&
            Number.isFinite(chunk.end) &&
            (chunk.page === undefined ||
              (Number.isInteger(chunk.page) && chunk.page > 0)),
        )
      )
        throw new Error(
          `The index for ${document.name} could not be restored. Remove and reimport it.`,
        );
      chunks.push(...index.chunks);
    } else {
      if (document.kind === 'pdf' || /\.pdf$/i.test(document.path))
        throw new Error(
          `The index for ${document.name} is missing. Remove and reimport it.`,
        );
      // Cache legacy Markdown/TXT documents on the first restore after upgrading.
      const text = await RNFS.readFile(document.path, 'utf8');
      const indexed = chunkMarkdown(document, text);
      await RNFS.writeFile(
        cache,
        JSON.stringify({
          version: 1,
          contentHash: document.contentHash,
          chunks: indexed,
        }),
        'utf8',
      );
      chunks.push(...indexed);
    }
  }
  return chunks;
}
