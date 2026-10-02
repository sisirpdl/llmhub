# PDF retrieval and chat attachments

## User flow

Open a chat's **Chat documents** control (also available in its header menu). Add a PDF, Markdown or TXT file, or tap a library entry to attach/detach it. A successful import from a chat attaches the new document to that chat. Settings → Manage local documents adds files to the shared library without attaching them anywhere.

Each chat searches only its attached documents. New, existing and JSON-imported chats default to no attachments. Selections persist locally with the conversation. One imported file can serve several chats without duplicate copies. Detaching affects only that chat; deleting from the library removes the original/index and requires affected chats to detach the missing attachment.

The latest response shows retrieved passages with document names and PDF page numbers. Tap a label to inspect the passage. These are reference passages supplied to the model, not proof that the model's answer is correct. Source labels are model-generated, and exact citation validation, persistent per-answer provenance and PDF page navigation are future work.

## Offline extraction and storage

- iOS: `ios/LlmHub/PdfText.mm` uses PDFKit, linked in the Xcode project.
- Android: `PdfTextModule.kt` uses bundled `com.tom-roush:pdfbox-android:2.0.27.0`, including phones below API 35. No remote extraction service or extra model is required.
- Both native modules serialize open/page/close operations on a worker queue. The JavaScript importer checks cancellation between stages/pages and closes the session in `finally`. Cancellation waits for an in-flight native operation to return; it cannot forcibly interrupt PDFKit/PDFBox inside one page or the initial open.
- Original files and versioned chunk caches remain in private Documents storage. A cache records the source content hash and page-aware passages; retrieval does not reopen/reparse PDFs. Older Markdown/TXT files gain caches on first restore.
- PDF chunks never cross page boundaries. Page numbers are 1-based; character spans are relative to the extracted page text.
- Keyword retrieval searches attached chunks and supplies up to five passages as temporary native system-message context. The portable chat format remains `{model, messages}`; exports omit originals, indexes and local attachment IDs.

## Limits and unsupported documents

| Input | Limit/behavior |
| --- | --- |
| PDF file | Up to 50 MiB, checked again after copying. |
| PDF pages | 1–300. |
| Extracted PDF text | Up to 250,000 UTF-16 code units per page and 2,000,000 per document. |
| Markdown/TXT | Up to 10 MiB. |
| Cached passages | Up to 10,000 per imported document. |
| Password-protected/encrypted PDF | Reject; request an unlocked copy. |
| Corrupt/restricted PDF | Report extraction/open error and clean up incomplete files. |
| Image-only PDF | Reject with an OCR explanation. |
| Mixed text/scanned pages | Index text pages and display the number of pages without extractable text. |

PDF reading order depends on how the source PDF was authored. Complex columns/tables may extract imperfectly; inspect passages before relying on them. OCR, semantic embeddings and multilingual retrieval improvements are separate follow-ups.

## Rebuild

Native changes require rebuilding; a Metro reload alone cannot add `PdfText`.

```sh
npm ci
npm run android
# macOS / iOS:
cd ios
bundle exec pod install
cd ..
npm run ios
```

## Automated and native parser checks

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
# Android emulator or connected device, with SDK installed:
cd android
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.llmhub.PdfExtractionTest
cd ..
# macOS PDFKit smoke check (same framework; not an iOS app/device test):
swift scripts/verify-pdfkit.swift test-fixtures/pdf
```

Fixtures are in `test-fixtures/pdf/`. Regenerate with `python scripts/generate-pdf-fixtures.py` after installing reportlab, pypdf and Pillow. They contain synthetic text; no private documents are included. JavaScript tests mock the native bridge and filesystem. Android instrumentation exercises the real bundled parser. PDFKit's macOS script checks real fixture extraction. Native builds/device checks must be recorded separately from those results.

## Both-platform app acceptance checks

Rebuild on iOS and Android, then copy the fixture PDFs to each device's Files/Downloads. Use a release build for the airplane-mode check, or retain a local Metro connection without internet in a development build.

1. Import `text.pdf`, attach it to chat A, and ask about the reference word. Inspect the page 2 passage containing **marigold**. Restart and confirm the attachment/index survives.
2. Create chat B without attachments and ask the same question. Confirm there are no retrieved passages from chat A. Attach the existing PDF in B and verify retrieval begins. Detach it and verify retrieval stops.
3. Import `columns.pdf`. Inspect left/right passages, including sentence 12. This fixture tests both columns; it does not establish correctness for every real-world column/table layout.
4. Import `large.pdf` (300 pages). Check progress, responsiveness and retrieval for `PAGE_300`; cancel an import midway, then retry successfully. Verify no cancelled document appears in the library.
5. Reject `page-limit.pdf` (301 pages), `locked.pdf`, `corrupt.pdf` and `scanned.pdf` with clear explanations. Import `mixed.pdf`, check the one-page warning and the page 2 **coriander** passage.
6. In airplane mode, import from local storage and query with a downloaded, loaded model. Confirm no online parser/model call is needed.
7. Delete a file used by both chats. Check both chats report a missing attachment and can detach it; unrelated document queries continue after the library refresh.
8. Export/import chat A. Check JSON retains the ordinary messages and generated answer, excludes PDF data/attachment IDs, and the imported chat starts without attachments.
9. Background during import/generation and open/cancel the system picker with a loaded model. Check session cleanup, partial responses and model lifecycle behavior.
