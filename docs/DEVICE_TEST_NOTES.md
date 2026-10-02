# Device Test Notes

## Earlier discovery/chat validation — 2026-10-01

Historical automated results before JSON interchange and document retrieval:

- `npm test -- --runInBand`: 77 tests passed across 17 suites, covering contextual download suggestions, phone-focused filtering, suitability explanations, settings, chat switching, saved images, imports, and model lifecycle.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Android and iOS production JavaScript bundles: passed.

## Latest implementation validation — 2026-10-01

The reconciled import/export and document-retrieval implementation passed:

- 105 tests across 19 suites, including native chat interchange, legacy migration, portable images, tool history, storage failures, retrieval after import and cancellation while retrieval is pending.
- Type checking and lint.
- Android and iOS production JavaScript bundles.

These results were obtained on the reconciled code before it was applied as `7aa6ea8` and merged into main. Main's source/tests/dependency manifests at `529abd2` match that tested code. This wording update did not rerun app tests. Native mocks and bundles do not establish physical-device correctness.

Native builds and hardware checks for the new memory readers are still pending. See [MODEL_IMPORTS.md](MODEL_IMPORTS.md) for rebuild commands and feature-specific phone checks.

The following release-gate checks require hardware and remain open:

## Android ARM64

- [ ] Fresh install, model download, checksum validation, and relaunch.
- [ ] Lock/background during download; record whether the platform pauses or completes it.
- [ ] Load model and run the deterministic `READY` smoke completion offline.
- [ ] Stream at least 500 generated tokens and check for sustained UI freezing.
- [ ] Background during model loading, generation, and idle loaded state.
- [ ] Trigger or simulate low-memory recovery and reload the model.

## Chat interchange and retrieval — both physical platforms

- [ ] Export/import text and supported image chats, cancel both dialogs and verify persistence after relaunch.
- [ ] Confirm header export, Android drawer import, iOS history import and App Info at the end of Settings.
- [ ] Verify built-in Qwen and vision templates after switching all completions to native messages.
- [ ] Import/query Markdown/TXT offline; check source labels, query/import errors and cancellation before inference starts.
- [ ] Verify external image references are preserved without automatic fetching and unresolved tool calls remain unexecuted/exportable.

## iOS

- [ ] Debug build launches in Simulator.
- [ ] Physical iPhone availability confirmed.
- [ ] If available, repeat download, inference, streaming, and lifecycle checks on device.

Until the physical iPhone checks are recorded, iOS support is development-preview only. No device performance or store-readiness claim should be made from Simulator results.
