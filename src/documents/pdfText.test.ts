import { NativeModules } from 'react-native';
import {
  extractPdf,
  DocumentImportCancelled,
  type ImportControl,
} from './pdfText';

const native = { open: jest.fn(), page: jest.fn(), close: jest.fn() };
beforeEach(() => {
  jest.resetAllMocks();
  NativeModules.PdfText = native;
  native.open.mockResolvedValue(2);
  native.page.mockImplementation((_id, index) =>
    Promise.resolve(index ? 'Page two' : 'Page one'),
  );
  native.close.mockResolvedValue(undefined);
});
test('extracts numbered pages and closes the native session', async () => {
  const progress = jest.fn();
  expect(
    await extractPdf('/private/book.pdf', {
      cancelled: false,
      onProgress: progress,
    }),
  ).toEqual([
    { page: 1, text: 'Page one' },
    { page: 2, text: 'Page two' },
  ]);
  expect(progress).toHaveBeenCalledWith('Reading page 2 of 2…');
  expect(native.close).toHaveBeenCalledWith(native.open.mock.calls[0][0]);
});
test('cancellation during opening closes the session without extracting pages', async () => {
  const control: ImportControl = { cancelled: false };
  native.open.mockImplementation(async () => {
    control.cancelled = true;
    return 2;
  });
  await expect(extractPdf('/private/book.pdf', control)).rejects.toBeInstanceOf(
    DocumentImportCancelled,
  );
  expect(native.page).not.toHaveBeenCalled();
  expect(native.close).toHaveBeenCalledTimes(1);
});
test('cancellation during extraction never reads the next page', async () => {
  const control: ImportControl = { cancelled: false };
  native.page.mockImplementation(async () => {
    control.cancelled = true;
    return 'Partial';
  });
  await expect(extractPdf('/private/book.pdf', control)).rejects.toBeInstanceOf(
    DocumentImportCancelled,
  );
  expect(native.page).toHaveBeenCalledTimes(1);
  expect(native.close).toHaveBeenCalledTimes(1);
});
test.each(['locked', 'corrupt'])(
  'preserves a native %s error and closes the session',
  async reason => {
    native.open.mockRejectedValue(new Error(reason));
    await expect(extractPdf('/private/book.pdf')).rejects.toThrow(reason);
    expect(native.close).toHaveBeenCalledTimes(1);
  },
);
test('explains that image-only PDFs require OCR', async () => {
  native.page.mockResolvedValue(' \n');
  await expect(extractPdf('/private/book.pdf')).rejects.toThrow(
    'Scanned PDFs need OCR',
  );
  expect(native.close).toHaveBeenCalledTimes(1);
});
test('keeps blank page positions for mixed text and image PDFs', async () => {
  native.page
    .mockResolvedValueOnce('')
    .mockResolvedValueOnce('Text on page two');
  expect((await extractPdf('/private/book.pdf'))[1].page).toBe(2);
});
test.each([0, 301, 1.5])(
  'rejects invalid or excessive page counts: %s',
  async count => {
    native.open.mockResolvedValue(count);
    await expect(extractPdf('/private/book.pdf')).rejects.toThrow('300 pages');
    expect(native.page).not.toHaveBeenCalled();
  },
);
test('bounds extracted text and closes on overflow', async () => {
  native.page.mockResolvedValue('x'.repeat(250001));
  await expect(extractPdf('/private/book.pdf')).rejects.toThrow(
    'extracted text limit',
  );
  expect(native.close).toHaveBeenCalledTimes(1);
});
test('reports that a native rebuild is required when the module is missing', async () => {
  delete NativeModules.PdfText;
  await expect(extractPdf('/private/book.pdf')).rejects.toThrow('rebuilding');
});
