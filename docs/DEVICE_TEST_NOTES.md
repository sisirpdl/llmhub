# Device Test Notes

Automated checks run on 2026-09-30:

- `npm test -- --runInBand`: 5 suites, 16 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.

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