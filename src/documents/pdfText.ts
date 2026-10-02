import { NativeModules } from 'react-native';

export type PdfPageText = { page: number; text: string };
export type ImportControl = {
  cancelled: boolean;
  onProgress?: (message: string) => void;
};
export class DocumentImportCancelled extends Error {
  constructor() {
    super('Document import cancelled.');
  }
}
export function checkImport(control?: ImportControl) {
  if (control?.cancelled) throw new DocumentImportCancelled();
}
type PdfTextBridge = {
  open(id: string, path: string): Promise<number>;
  page(id: string, index: number): Promise<string>;
  close(id: string): Promise<void>;
};

export async function extractPdf(
  path: string,
  control?: ImportControl,
): Promise<PdfPageText[]> {
  const native = NativeModules.PdfText as PdfTextBridge | undefined;
  if (!native) throw new Error('PDF support requires rebuilding the app.');
  const id = `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pages: PdfPageText[] = [];
  let characters = 0;
  checkImport(control);
  try {
    control?.onProgress?.('Opening PDF…');
    const count = await native.open(id, path);
    if (!Number.isInteger(count) || count < 1 || count > 300)
      throw new Error('PDFs must contain between 1 and 300 pages.');
    for (let index = 0; index < count; index++) {
      checkImport(control);
      control?.onProgress?.(`Reading page ${index + 1} of ${count}…`);
      const text = await native.page(id, index);
      checkImport(control);
      characters += text.length;
      if (text.length > 250000 || characters > 2_000_000)
        throw new Error(
          'This PDF exceeds the extracted text limit. Import a smaller document.',
        );
      pages.push({ page: index + 1, text });
    }
    if (!pages.some(page => page.text.trim()))
      throw new Error(
        'This PDF has no extractable text. Scanned PDFs need OCR, which is not supported yet.',
      );
    return pages;
  } finally {
    // Also closes an opened session if cancellation arrived while open() was running.
    try {
      await native.close(id);
    } catch {
      /* Preserve the original import error. */
    }
  }
}
