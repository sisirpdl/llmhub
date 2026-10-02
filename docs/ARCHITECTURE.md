# LLM Hub architecture

## Status and current implementation

Bare React Native 0.86 with TypeScript, React 19.2.3, New Architecture enabled, and `llama.rn` pinned to 0.12.0. Native source lives in `android/` and `ios/`. The app currently uses its own shell/navigation state; React Navigation is a planned migration, not an installed dependency.

| Boundary | Current code | Responsibility |
| --- | --- | --- |
| App coordination | `src/app/AppController.tsx` | Navigation, preferences, active model and conversation wiring. |
| Platform shells | `src/app/AppShell.android.tsx`, `AppShell.ios.tsx` | Android drawer/app bar and iOS tab/title presentation. |
| Model lifecycle | `src/app/useModelController.ts` | Download/load/offload/delete, one active context, foreground lifecycle. |
| Artifact storage | `src/models/modelStore.ts`, `importedModels.ts` | Private model files, validation, checksums and saved import metadata. |
| Discovery | `src/models/huggingFace.ts`, `ModelDiscovery.tsx`, `GGUFVariants.tsx` | Remote repository/file metadata and phone-focused presentation. |
| Memory guidance | `src/models/ggufMetadata.ts`, `deviceSuitability.ts`, `src/device/memory.ts` | Range-read metadata, estimates and native Android/iOS memory readings. |
| Chat | `src/chat/useChatController.ts`, `promptBuilder.ts`, `attachments.ts` | Streamed responses, saved conversations/images, retrieval context and native message selection. |
| Chat interchange | `src/chat/chatDocument.ts`, `conversationStore.ts`, `chatTransfer.ts` | Native OpenAI messages, v3 storage, legacy migration and portable JSON import/export. |
| Local documents | `src/documents/documentStore.ts`, `documentIndex.ts`, `useDocumentIndex.ts` | PDF/Markdown/TXT import, cached page-aware chunks and chat-scoped keyword retrieval. |
| Settings | `src/settings/modelSettings.ts`, `ModelSettingsSheet.tsx` | Validated model profiles and staged edits; system instruction belongs to a chat. |

AsyncStorage stores conversation/settings/import metadata. GGUF files and retained image attachments live in private app storage. Discovery credentials remain in memory rather than persisted settings. All chat and load-smoke completions pass native OpenAI messages to llama.rn's embedded template formatter; the application does not serialize ChatML/text prompts. The v3 conversation store keeps `{ model, messages }` with UI metadata alongside it. System instructions live in system messages; images use typed content parts. JSON import/export uses the same payload. See [CHAT_IMPORT_EXPORT.md](CHAT_IMPORT_EXPORT.md). Context selection still uses a character-based approximation; token-accurate budgeting remains planned.

Generation stops and contexts are released on backgrounding. Switching releases the old context before loading the replacement to avoid simultaneous allocations. A failed switch retains conversation data and must report the real loaded/unloaded state. Route changes alone should not force unnecessary reloads.

## Planned modular boundaries

Keep UI/controllers separate from native engine ownership. Introduce interfaces incrementally when the corresponding story is built; do not prebuild an SDK or replace working code solely to match this diagram.

| Planned module | Contract |
| --- | --- |
| Inference runtime | Load/release, stream/cancel, capability reporting, tokenization, embeddings and validated template handling. |
| Model resolver | Match required task/parameters/context/license/engine support against installed, verified artifacts and user overrides. |
| Artifact manager | Common staging, storage reservations, integrity verification and atomic promotion for HTTP, local and peer imports. |
| Document index | Extend the existing local text chunks and keyword retrieval with embeddings, persistent provenance and verified citations. |
| Benchmark registry | Exact artifact/runtime/device configuration and measured results; no fabricated performance values. |
| Transport adapters | In-process local runtime, authenticated Android shared service and explicitly paired LAN service. |

Only one generation context remains active by default. RAG embeddings may require a separate model: measure peak memory, release/schedule contexts, and avoid silently requiring both models to fit simultaneously.

## Current local document retrieval

Users import `.pdf`, `.md`, `.markdown` or `.txt` files from Ask your docs or Settings → Manage local documents. Originals, hashes and versioned chunk caches live in private app storage. PDFKit extracts text page by page on iOS; bundled PDFBox-Android 2.0.27.0 does the same across supported Android versions. Native extraction runs on a serial worker queue. Scans require OCR and receive an unsupported explanation; mixed PDFs retain searchable pages and report pages without extractable text. See [PDF_RAG.md](PDF_RAG.md) for limits and validation.

The library is shared, but each conversation keeps optional local `documentIds` alongside its UI metadata. Only attached documents are searched; existing/new/imported chats default to no attachments. Legacy Markdown/TXT files receive caches on first restore. Deleting a library file removes its original/index and leaves a clearly detachable missing attachment in affected chats.

Retrieval ranks overlapping chunks by query-term matches and returns up to five passages. Reference text and an instruction to treat it as untrusted material are added to native system-message context for that completion. PDF chunks stay within a page and carry 1-based page numbers and page-relative character spans. The UI shows latest-response passage labels and opens the retrieved text. Generated citation text is not independently verified. Local attachment IDs, source passages and indexes are excluded from portable `{model, messages}` exports.

OCR, semantic embeddings, exact token budgeting, persistent per-response provenance, PDF page navigation/highlighting and validated citations remain planned. The pipeline below describes the fuller target; copying, text extraction and cached keyword indexing are implemented.

## Planned offline RAG data path

1. Copy an explicitly selected PDF/markdown document into app-owned storage.
2. Extract text locally and retain document/page/section identifiers. Scanned PDFs require an explicit OCR capability or a clear unsupported explanation.
3. Chunk with stable source spans; create embeddings locally with a tested embedding model.
4. Save a versioned local index keyed by document content hash, embedding-model identity and chunking configuration.
5. Retrieve passages, budget them with the system instruction/history/output allowance using real tokenization, and generate locally.
6. Render citations that resolve to retained source spans. Distinguish generated claims from retrieved evidence; never imply that a citation proves an unsupported answer.

Deleting a document must remove its owned source/index data and handle references in saved chats clearly. Imported text is untrusted input, not permission to execute instructions or tools. No hosted parser, embedding API or hidden OCR upload is permitted in offline RAG.

## Curated models and benchmarks

Retain size filtering and GGUF-level suitability estimates. Add a versioned recommendation manifest with artifact revision/hash, license/source, task, quantization, template, required projector, tested device/runtime profiles and benchmark provenance.

Benchmark records must include chip/device, OS, app and engine version, model/projector hashes, quantization, context, threads/backend settings, prompt and output sizes, load time, time to first token, prefill/decode rates, peak memory, thermal state and repeated-run variation. Store privately by default; any contribution/upload requires explicit consent and no user content.

Show “measured on this profile” only for a matching tested configuration. Otherwise show an explicitly labeled nearby-device estimate or “not measured.” The example “~25 tok/s, 3.2 GB RAM” is a desired presentation format, not a current measurement. Engine compatibility and successful loading remain separate from estimated RAM fit.

## Background artifact transfers

Current bundled downloads use `RNFS.downloadFile` and restart temporary files on retry. Do not describe them as a durable pause/resume or background manager.

Plan native adapters: Android supported scheduled/foreground transfer mechanisms and iOS background URLSession. Persist task/artifact identity, offset and server validators. Resume only when ranges and revision/ETag validation permit it; otherwise explain restart. Reserve combined model/projector space, verify final hashes, and atomically promote files. Background downloads and foreground-only inference have different lifecycle rules; neither platform promises completion after user force-quit.

## P2P sharing and trust

Investigate iOS MultipeerConnectivity and Android Nearby Connections (or another validated local transport). Cross-platform discovery and wire interoperability are a required spike: choosing two platform APIs does not establish that they can communicate with each other. Prove iPhone ↔ Android transfer without internet before committing to that architecture.

Transfer a versioned artifact manifest, chunk map and bytes after explicit pairing/consent. Verify each chunk against the manifest to support resume, then hash the complete artifact before registration. Treat peer-supplied chunk hashes as corruption detection, not proof of provenance.

For offline upstream verification, the receiver must already have a trusted digest for the exact repository revision/artifact, such as a vetted bundled manifest or previously authenticated upstream metadata. A stranger supplying both a file and its claimed hash cannot establish upstream authenticity. Without trusted metadata, label the provenance unverified; do not claim the file is provably legitimate. A matching hash proves artifact identity, not safety, accuracy or permission to redistribute. Check model licensing/gated-repository terms before sharing.

Start with single-peer transfer and interruption recovery. Multi-peer chunk scheduling comes after measured reliability, battery and disk-space behavior.

## LAN hosting

An opt-in host exposes a documented OpenAI-compatible subset on the local network. Validate whether the pinned llama backend can host through app-owned native code or needs a separately integrated llama-server component; server support is not assumed from `llama.rn` completion support.

Require explicit start/stop, paired client authentication, user-visible active clients, cancellation, resource limits and a secure channel. Discovery must not make an unauthenticated inference endpoint public. Default to foreground hosting until each platform's lifecycle constraints are proven. Do not fall back to LAN or cloud without consent.

Local mode keeps inference content on the originating phone. LAN mode sends prompts and attachments to the selected host and returns responses; it stays on the LAN but is no longer “no data leaves your phone.” Explain that before connecting. Host retention/logging must be explicit and off by default for content.

## Android shared runtime / iOS embedded SDK

Expose one logical SDK API: availability, capability resolution, permission/session creation, streamed chat, cancellation, and later document retrieval. Transport differences must be explicit in capabilities and errors.

### Android

Hub owns model storage and a localhost service. Localhost alone is not caller authentication. Investigate a native Binder-mediated permission/identity handshake with package/UID verification and short-lived session credentials for HTTP access. Do not trust a package name provided by an HTTP client. Permissions need persistent grants, revocation, rate limits and a clear active-use indicator. Validate service lifecycle/foreground requirements, memory contention and background-start restrictions on supported Android versions.

`hub.isAvailable()` means a compatible service is reachable, not simply that an APK exists. If absent, offer Install Hub or a declared in-process tiny fallback; never quietly use hosted inference. User overrides take precedence among models meeting declared requirements. If no eligible artifact fits or is installed, return an actionable resolution error.

### iOS

Embed the engine in the third-party app. Hub cannot assume access to unrelated apps' private model files or a durable shared background process. This is the reason for the embedded architecture; avoid reducing it to a blanket claim that every cross-app loopback connection is technically impossible.

Availability means that app's embedded engine and usable local artifacts are ready. Fallback is a tiny bundled model or an explicit local download. The user consents within the consuming app. Shared SDK API does not mean shared storage or cross-app permission grants. Do not implement loopback/app-switching workarounds; App Groups do not solve arbitrary cross-developer storage sharing.

## Assistants and tools

Siri integration uses App Intents/Shortcuts with measured execution budgets and an appropriate foreground handoff. Android default-assistant integration requires a `VoiceInteractionService`, user selection and gesture-triggered push-to-talk. Always-on hotword is out of scope.

Future local tools require capability-specific permission, confirmation for consequential actions, and cancellation/error handling. Retrieved document instructions never grant tool permission. Audio and tool calling remain separate native feasibility stories from existing vision chat.

## Decision gates before implementation

- RAG: local parser/embedding/vector index compatible with both targets; token budgeting and memory scheduling demonstrated.
- Curation: benchmark protocol and evidence schema before displaying speeds or promoting defaults.
- P2P: cross-platform offline transport, trusted metadata bootstrapping and redistribution policy proven.
- LAN: server/backend integration, client trust, privacy wording and host lifecycle proven.
- SDK: authenticated Android caller grants and viable iOS embedded packaging demonstrated with two demo apps.
- Assistant: actual OS/version behavior verified against current platform documentation and hardware.

Use current official platform documentation during these spikes. This plan records design intent, not a certification of OS capabilities or current competitor features.
