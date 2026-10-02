# llmhub

A private, offline-first chat app that runs GGUF language models directly on iOS and Android devices.

Download a built-in model, browse GGUF repositories on Hugging Face, or import a local file or remote download URL. Chat offline with streamed responses and shared model lifecycle controls. Setup and device checks for imports are in [docs/MODEL_IMPORTS.md](docs/MODEL_IMPORTS.md). The delivery plan is in [docs/USER_STORIES.md](docs/USER_STORIES.md).

## Native acceleration assets

The optional Android `ggml-hexagon` binaries under `android/app/src/main/assets/ggml-hexagon/` are local build inputs and are intentionally excluded from the repository. Provide them separately on machines that build with Hexagon acceleration enabled. Builds without those binaries use the standard backend when supported by the installed `llama.rn` configuration.

## Validation status

The shared TypeScript/UI and Jest checks pass. Physical Android ARM64 and iPhone validation are tracked in [docs/DEVICE_TEST_NOTES.md](docs/DEVICE_TEST_NOTES.md). Until iPhone device checks are recorded, iOS is a development-preview target; Simulator results do not certify inference, memory, thermal behavior, or large-file reliability.
