# llmhub

A private, offline-first chat app that runs GGUF language models directly on iOS and Android devices.

The first release is deliberately narrow: download a supported text model, chat with it offline, stream responses smoothly, and release native resources safely. The delivery plan is in [docs/USER_STORIES.md](docs/USER_STORIES.md).

## Validation status

The shared TypeScript/UI and Jest checks pass. Physical Android ARM64 and iPhone validation are tracked in [docs/DEVICE_TEST_NOTES.md](docs/DEVICE_TEST_NOTES.md). Until iPhone device checks are recorded, iOS is a development-preview target; Simulator results do not certify inference, memory, thermal behavior, or large-file reliability.
