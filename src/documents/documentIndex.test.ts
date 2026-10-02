import {
  chunkMarkdown,
  formatRetrievedContext,
  retrieveChunks,
} from './documentIndex';

const document = {
  id: 'notes',
  name: 'Notes.md',
  path: '/documents/notes.md',
  contentHash: 'hash',
  size: 100,
  importedAt: 1,
};

test('chunks markdown while retaining headings and source offsets', () => {
  const chunks = chunkMarkdown(
    document,
    '# Offline notes\n\nThe phone keeps private notes locally.\n\n## Storage\n\nModels stay on the device.',
    80,
    10,
  );
  expect(chunks).toHaveLength(4);
  expect(chunks[0]).toMatchObject({heading: 'Offline notes'});
  expect(chunks[1].text).toContain('private notes');
  expect(chunks[2]).toMatchObject({heading: 'Storage'});
  expect(chunks[1].start).toBeGreaterThan(chunks[0].start);
});

test('retrieves relevant chunks and formats stable source markers', () => {
  const chunks = chunkMarkdown(
    document,
    '# Food\n\nApples and pears are fruit.\n\n# Travel\n\nThe train leaves at noon.',
  );
  const results = retrieveChunks('When does the train leave?', chunks);
  expect(results).toHaveLength(1);
  expect(results[0].heading).toBe('Travel');
  expect(formatRetrievedContext(results)).toContain('[Source 1: Notes.md · Travel]');
  expect(formatRetrievedContext(results)).toContain('train leaves at noon');
});

test('returns no sources for an empty or unrelated query', () => {
  const chunks = chunkMarkdown(document, 'A short local note.');
  expect(retrieveChunks('', chunks)).toEqual([]);
  expect(retrieveChunks('quantum entanglement', chunks)).toEqual([]);
});
