import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteDocument,
  importTextDocument,
  loadDocumentChunks,
  readDocuments,
  type PickedTextDocument,
} from './documentStore';
import {
  retrieveChunks,
  type DocumentChunk,
  type DocumentRecord,
  type RetrievedChunk,
} from './documentIndex';
import { DocumentImportCancelled, type ImportControl } from './pdfText';

export function useDocumentIndex() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [indexReady, setIndexReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const operation = useRef<ImportControl | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    const restored = await readDocuments();
    if (!mounted.current) return;
    setDocuments(restored);
    setIndexReady(false);
    const indexed = await loadDocumentChunks(restored);
    if (!mounted.current) return;
    setChunks(indexed);
    setLoaded(true);
    setIndexReady(true);
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload().catch(cause => {
      if (!mounted.current) return;
      setError(
        cause instanceof Error
          ? cause.message
          : 'Saved documents could not be restored.',
      );
      setLoaded(true);
    });
    return () => {
      mounted.current = false;
      if (operation.current) operation.current.cancelled = true;
    };
  }, [reload]);

  const importDocument = useCallback(
    async (picked: PickedTextDocument) => {
      if (busy.current)
        throw new Error('Wait for the current document operation to finish.');
      busy.current = true;
      const control: ImportControl = {
        cancelled: false,
        onProgress: message => {
          if (mounted.current) setProgress(message);
        },
      };
      operation.current = control;
      setWorking(true);
      setError('');
      try {
        const document = await importTextDocument(picked, control);
        await reload();
        return document;
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof DocumentImportCancelled
              ? ''
              : cause instanceof Error
              ? cause.message
              : 'Document import failed.',
          );
        throw cause;
      } finally {
        busy.current = false;
        operation.current = null;
        if (mounted.current) {
          setWorking(false);
          setProgress('');
        }
      }
    },
    [reload],
  );

  const removeDocument = useCallback(
    async (document: DocumentRecord) => {
      if (busy.current)
        throw new Error('Wait for the current document operation to finish.');
      busy.current = true;
      setWorking(true);
      setError('');
      try {
        await deleteDocument(document);
        await reload();
      } catch (cause) {
        if (mounted.current)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Document deletion failed.',
          );
        throw cause;
      } finally {
        busy.current = false;
        if (mounted.current) setWorking(false);
      }
    },
    [reload],
  );

  const retrieve = useCallback(
    async (
      query: string,
      documentIds: string[] = [],
    ): Promise<RetrievedChunk[]> => {
      if (!documentIds.length) return [];
      if (!indexReady || busy.current)
        throw new Error(
          'The document library is not ready. Wait or detach documents to continue.',
        );
      const selected = new Set(documentIds);
      if (
        documentIds.some(id => !documents.some(document => document.id === id))
      )
        throw new Error(
          'An attached document is missing. Open Chat documents and detach it.',
        );
      return retrieveChunks(
        query,
        chunks.filter(chunk => selected.has(chunk.documentId)),
      );
    },
    [chunks, documents, indexReady],
  );

  const cancelImport = () => {
    if (operation.current) operation.current.cancelled = true;
  };
  return {
    documents,
    loaded,
    working,
    progress,
    error,
    importDocument,
    removeDocument,
    retrieve,
    cancelImport,
  };
}
export type DocumentController = ReturnType<typeof useDocumentIndex>;
