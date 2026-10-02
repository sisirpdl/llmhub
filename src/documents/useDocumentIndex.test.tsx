jest.mock('./documentStore', () => ({
  readDocuments: jest.fn(),
  loadDocumentChunks: jest.fn(),
  importTextDocument: jest.fn(),
  deleteDocument: jest.fn(),
}));
import React from 'react';
import Renderer from 'react-test-renderer';
import { useDocumentIndex, type DocumentController } from './useDocumentIndex';
import {
  readDocuments,
  loadDocumentChunks,
  deleteDocument,
} from './documentStore';
let controller: DocumentController;
let renderer: Renderer.ReactTestRenderer;
const documents = ['document-one', 'document-two'].map(id => ({
  id,
  name: `${id}.pdf`,
  path: `/private/${id}.pdf`,
  contentHash: 'a'.repeat(64),
  size: 100,
  importedAt: 1,
}));
function Harness() {
  controller = useDocumentIndex();
  return null;
}
beforeEach(() => {
  jest.resetAllMocks();
  (readDocuments as jest.Mock).mockResolvedValue(documents);
  (loadDocumentChunks as jest.Mock).mockResolvedValue(
    documents.map(document => ({
      id: `${document.id}:1`,
      documentId: document.id,
      documentName: document.name,
      text: 'Sunlight powers photosynthesis.',
      page: 1,
      start: 0,
      end: 30,
    })),
  );
});
afterEach(async () => {
  if (renderer) await Renderer.act(async () => renderer.unmount());
});
test('retrieval searches only the selected documents, and no attachments means no search', async () => {
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  expect(await controller.retrieve('Sunlight', [])).toEqual([]);
  const sources = await controller.retrieve('Sunlight', ['document-two']);
  expect(sources).toHaveLength(1);
  expect(sources[0].documentId).toBe('document-two');
  await expect(
    controller.retrieve('Sunlight', ['document-missing']),
  ).rejects.toThrow('missing');
});
test('failed index restore retains the library so a broken document can be deleted', async () => {
  (loadDocumentChunks as jest.Mock).mockRejectedValueOnce(
    new Error('Broken index'),
  );
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  expect(controller.documents).toEqual(documents);
  expect(controller.error).toBe('Broken index');
  await expect(
    controller.retrieve('Sunlight', ['document-one']),
  ).rejects.toThrow('not ready');
  await Renderer.act(async () => {
    await controller.removeDocument(documents[0]);
  });
  expect(deleteDocument).toHaveBeenCalledWith(documents[0]);
  expect(controller.error).toBe('');
});
