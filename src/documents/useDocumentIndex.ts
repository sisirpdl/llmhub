import { useCallback, useEffect, useState } from 'react';
import {
  deleteDocument,
  importTextDocument,
  loadDocumentChunks,
  readDocuments,
  type PickedTextDocument,
} from './documentStore';
import { retrieveChunks, type DocumentChunk, type DocumentRecord, type RetrievedChunk } from './documentIndex';

export function useDocumentIndex() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const restored = await readDocuments();
    const indexed = await loadDocumentChunks(restored);
    setDocuments(restored);
    setChunks(indexed);
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload().catch(() => {
      setError('Saved documents could not be restored.');
      setLoaded(true);
    });
  }, [reload]);

  const importDocument = useCallback(async (picked: PickedTextDocument) => {
    setWorking(true);
    setError('');
    try {
      await importTextDocument(picked);
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Document import failed.';
      setError(message);
      throw cause;
    } finally {
      setWorking(false);
    }
  }, [reload]);

  const removeDocument = useCallback(async (document: DocumentRecord) => {
    setWorking(true);
    setError('');
    try {
      await deleteDocument(document);
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Document deletion failed.';
      setError(message);
      throw cause;
    } finally {
      setWorking(false);
    }
  }, [reload]);

  const retrieve = useCallback(async (query: string): Promise<RetrievedChunk[]> => {
    if (!loaded) return [];
    return retrieveChunks(query, chunks);
  }, [chunks, loaded]);

  return {documents, loaded, working, error, importDocument, removeDocument, retrieve};
}
export type DocumentController = ReturnType<typeof useDocumentIndex>;
