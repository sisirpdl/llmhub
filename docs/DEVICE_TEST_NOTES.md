# Device Test Notes

Automated checks for device-aware discovery and chat run on 2026-10-01:

- `npm test -- --runInBand`: the current suite covers browsing, suitability estimates, settings, chat switching, saved images, imports, and model lifecycle.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- Android and iOS production JavaScript bundles: passed.

Native builds and hardware checks for the new memory readers are still pending. See [MODEL_IMPORTS.md](MODEL_IMPORTS.md) for rebuild commands and feature-specific phone checks.

The following release-gate checks require hardware and remain open:

## Android ARM64

- [ ] Fresh install, model download, checksum validation, and relaunch.
- [ ] Lock/background during download; record whether the platform pauses or completes it.
- [ ] Load model and run the deterministic `READY` smoke completion offline.
- [ ] Stream at least 500 generated tokens and check for sustained UI freezing.
- [ ] Background during model loading, generation, and idle loaded state.
- [ ] Trigger or simulate low-memory recovery and reload the model.

## iOS

- [ ] Debug build launches in Simulator.
- [ ] Physical iPhone availability confirmed.
- [ ] If available, repeat download, inference, streaming, and lifecycle checks on device.

Until the physical iPhone checks are recorded, iOS support is development-preview only. No device performance or store-readiness claim should be made from Simulator results.