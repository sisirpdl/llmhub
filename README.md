# llmhub

A private, offline-first chat app that runs GGUF language models directly on iOS and Android devices.

Download a built-in model, browse GGUF repositories on Hugging Face, or import a local file or remote download URL. Chat offline with streamed responses and shared model lifecycle controls. Conversations use native OpenAI messages and portable JSON import/export; local PDF/Markdown/TXT documents support keyword retrieval scoped to each chat. See [docs/PDF_RAG.md](docs/PDF_RAG.md) for PDF limits, rebuild steps and validation. See [docs/CHAT_IMPORT_EXPORT.md](docs/CHAT_IMPORT_EXPORT.md) for the chat format and file controls. Current capabilities and future direction are in [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md); model import setup is in [docs/MODEL_IMPORTS.md](docs/MODEL_IMPORTS.md), and hardware validation is in [docs/DEVICE_TEST_NOTES.md](docs/DEVICE_TEST_NOTES.md).

## Local Wi-Fi hosting (preview)

Load a model on one phone, start hosting in Settings, and connect from another phone on the same Wi-Fi using its address and access key. No model download is needed on the client. This foreground-only preview supports text chat with completed responses; LAN messages and retrieved document passages leave the client phone for the selected host over unencrypted local HTTP. Native builds and two-device tests remain pending. See [docs/LAN_HOSTING.md](docs/LAN_HOSTING.md) for setup, API scope, privacy, and validation.

## Nearby model sharing (preview)

Send an installed model to another phone on the same Wi-Fi from Models, then choose **Receive model nearby** on the other phone. Explicit pairing, encrypted chunks, resumable partial files and final verification are implemented; native builds and physical Android/iPhone interoperability tests remain pending. Vision models include their projector. No internet is required for the transfer. See [docs/NEARBY_TRANSFER.md](docs/NEARBY_TRANSFER.md).

## Native acceleration assets

The optional Android `ggml-hexagon` binaries under `android/app/src/main/assets/ggml-hexagon/` are local build inputs and are intentionally excluded from the repository. Provide them separately on machines that build with Hexagon acceleration enabled. Builds without those binaries use the standard backend when supported by the installed `llama.rn` configuration.

## Validation status

The shared TypeScript/UI and Jest checks pass. Physical Android ARM64 and iPhone validation are tracked in [docs/DEVICE_TEST_NOTES.md](docs/DEVICE_TEST_NOTES.md). Until iPhone device checks are recorded, iOS is a development-preview target; Simulator results do not certify inference, memory, thermal behavior, or large-file reliability.
