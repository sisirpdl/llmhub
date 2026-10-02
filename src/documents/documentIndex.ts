export type DocumentRecord = {
  id: string;
  name: string;
  path: string;
  contentHash: string;
  size: number;
  importedAt: number;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  documentName: string;
  text: string;
  heading?: string;
  start: number;
  end: number;
};

export type RetrievedChunk = DocumentChunk & {score: number};

const WORD_PATTERN = /[a-z0-9][a-z0-9'_-]*/gi;
const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 160;

export function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(WORD_PATTERN) || [];
}

export function chunkMarkdown(
  document: DocumentRecord,
  source: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP,
): DocumentChunk[] {
  if (!source.trim()) return [];
  const chunks: DocumentChunk[] = [];
  let heading: string | undefined;
  let cursor = 0;
  const paragraphs = source.split(/\n\s*\n/);

  for (const paragraph of paragraphs) {
    const start = source.indexOf(paragraph, cursor);
    cursor = start + paragraph.length;
    const headingMatch = paragraph.match(/^#{1,6}\s+(.+)$/m);
    if (headingMatch) heading = headingMatch[1].trim();
    const text = paragraph.trim();
    if (!text) continue;

    let offset = 0;
    while (offset < text.length) {
      const end = Math.min(text.length, offset + chunkSize);
      const value = text.slice(offset, end).trim();
      if (value) {
        const chunkStart = start + paragraph.indexOf(value, offset);
        chunks.push({
          id: `${document.id}:${chunks.length}`,
          documentId: document.id,
          documentName: document.name,
          text: value,
          heading,
          start: chunkStart,
          end: chunkStart + value.length,
        });
      }
      if (end === text.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return chunks;
}

export function retrieveChunks(
  query: string,
  chunks: DocumentChunk[],
  limit = 5,
): RetrievedChunk[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const uniqueTerms = [...new Set(terms)];
  return chunks
    .map(chunk => {
      const chunkTerms = tokenize(chunk.text);
      const counts = new Map<string, number>();
      chunkTerms.forEach(term => counts.set(term, (counts.get(term) || 0) + 1));
      const score = uniqueTerms.reduce(
        (total, term) => total + Math.min(counts.get(term) || 0, 3),
        0,
      );
      return {...chunk, score};
    })
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, limit);
}

export function formatRetrievedContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return '';
  return chunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}: ${chunk.documentName}${
          chunk.heading ? ` · ${chunk.heading}` : ''
        }]\n${chunk.text}`,
    )
    .join('\n\n');
}
