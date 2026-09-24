# llmhub — two-week delivery backlog

## Product outcome

Within two weeks, a user on a supported physical iPhone or Android phone can download one approved GGUF model, load it, and have an offline text conversation with token streaming. The app gives clear download, storage, loading, and error feedback and safely stops/releases inference when the app loses foreground access.

This is a functioning private-LLM MVP, not a Siri replacement, a cloud chat product, or a general model marketplace.

## Technical decisions

| Area | Decision | Why |
| --- | --- | --- |
| App shell | Bare React Native with TypeScript | The team owns `ios/` and `android/` for native inference tuning and future engine work. |
| Native inference | `llama.rn`, backed by llama.cpp and GGUF models | One inference API across iOS and Android, with native execution. Pin the exact version after the device-build spike. |
| Rendering | React Native New Architecture enabled | Validate compatibility during the first story; do not assume it merely improves inference. |
| State | Local React state + small focused stores/contexts | Avoid Redux until a demonstrated need; keep model lifecycle separate from chat state. |
| Files | A React Native-compatible file/downloader implementation selected in Story 1.2 | Expo APIs are not the baseline in a bare project. Evaluate resume support, HTTP range support, progress callbacks, and both OS targets. |
| Persistence | Local on-device storage for conversation metadata and settings | No account, analytics, or cloud backend in the MVP. |
| Initial models | A vetted text-only 1B–3B instruct GGUF in Q4-class quantization | Small enough to test realistically; publish exact compatibility, size, license, prompt template, and checksum in an in-app manifest. |
| Target devices | Real iOS and Android ARM64 devices | Simulators/emulators are useful for UI only, not proof of performance or memory behavior. |

### Constraints we will design around

- Model files are large. The app must check free space before download and verify the completed file before treating it as usable.
- iOS and Android control background execution. A download may continue using supported platform mechanisms, but the product must not promise completion after the app is force-quit. Inference never runs in the background.
- A model being stored on disk is not the same as being loaded in RAM. Only one model context is active at a time.
- Prompt format is model-specific. Store a template with each supported model; do not hard-code ChatML for every model.
- The iOS increased-memory entitlement is not a general app setting to assume exists or solves memory pressure. Validate eligibility and actual device behavior before relying on it.

## Definition of done

A story is done only when its acceptance criteria pass on the stated targets, errors are visible to the user, TypeScript/lint checks pass, and the pull request includes a short device-test note. A feature that only works in a simulator is not done for inference or large-file behavior.

## Team lanes

**Developer A — native, storage, reliability:** `llama.rn` integration, iOS/Android builds, model catalog/download/storage, lifecycle and profiling.

**Developer B — product/UI:** application shell, chat state and UI, streamed rendering, persistence, accessibility, and integration tests.

Both developers pair on the device smoke tests at the end of each day. Merge small PRs behind working, user-visible states rather than maintaining a long-lived integration branch.

## Milestones

| Milestone | End-of-day evidence |
| --- | --- |
| Day 1 | Empty app builds and launches on one physical iOS device and one physical Android device. |
| Day 3 | A manifest-selected model downloads with visible progress and remains usable after app relaunch. |
| Day 5 | The model loads and produces a deterministic test completion on both devices. |
| Day 8 | A user can conduct a streamed text chat locally. |
| Day 10 | Lifecycle/error cases pass on both targets; release candidate is manually tested. |

## Sprint 1 — engine room

### US-1.1 — establish a native-capable app foundation

**Owner:** Developer A  
**Priority:** P0  
**Estimate:** 1 day

**As a developer,** I can build and run the same bare React Native application on physical iOS and Android devices so native local inference can be integrated without a platform rewrite.

**Acceptance criteria**

- The repository contains a TypeScript React Native app with the New Architecture configuration explicitly recorded.
- `llama.rn` is added at a pinned version and linked according to its maintained installation instructions.
- A Debug build launches on one physical iPhone and one physical Android ARM64 device.
- iOS and Android native build configuration is committed; no local-only manual changes are needed to reproduce the build.
- The app presents an Engine Diagnostics screen with app version, OS/device details, available storage, and the `llama.rn` integration status—never user prompt content.

**Out of scope:** chat UI polish, model downloads, and benchmark claims.

### US-1.2 — publish a controlled model catalog

**Owner:** Developer A, reviewed by Developer B  
**Priority:** P0  
**Estimate:** 0.5 day

**As a user,** I can see only models that the app has tested and supports, so I do not download an incompatible file.

**Acceptance criteria**

- A versioned local JSON manifest defines at least one text model: id, display name, GGUF URL, byte size, SHA-256 checksum, license/source URL, prompt-template id, and recommended context length.
- The initial supported model is text-only, Q4-class, and documented as a tested device profile rather than universally compatible.
- The catalog UI communicates disk size and that performance/memory vary by device.
- A model cannot be selected until all required metadata validates.

**Out of scope:** arbitrary Hugging Face URLs, user-imported models, and model conversion.

### US-1.3 — download and validate a model

**Owner:** Developer A  
**Priority:** P0  
**Estimate:** 1.5 days

**As a user,** I can download a supported model to app-owned storage and know whether it completed correctly.

**Acceptance criteria**

- Before download, the app checks that available space exceeds model size plus a documented safety margin; insufficient space is actionable.
- The UI shows downloaded bytes, total bytes when the server supplies it, percentage, and download state: queued, downloading, paused/interrupted, failed, validating, ready.
- A failed/interrupted download may be retried. Resume is used only when the chosen library/server support it; otherwise the UI clearly restarts it.
- The model is written to a temporary path and moved to its final app-owned path only after checksum validation succeeds.
- An invalid or partial file is never offered to the inference engine.
- A completed model remains available after app restart.

**Device test:** lock the screen and background the app during a download on both targets; document the observed OS behavior rather than treating continuation as guaranteed.

### US-1.4 — manage downloaded models

**Owner:** Developer B  
**Priority:** P1  
**Estimate:** 0.5 day

**As a user,** I can see a downloaded model’s status and delete it deliberately to recover space.

**Acceptance criteria**

- The catalog distinguishes not downloaded, downloading, ready, loading, active, and failed states.
- Delete requires confirmation, releases an active context first, removes the GGUF and its metadata, and refreshes available storage.
- The active model cannot be deleted while generating; the user is prompted to stop generation first.

### US-1.5 — prove native text inference

**Owner:** Developer A  
**Priority:** P0  
**Estimate:** 1.5 days

**As a user,** I can load a validated downloaded model and receive an offline response, proving the engine works end to end.

**Acceptance criteria**

- `initLlama` (or the pinned library equivalent) loads the model from its local filesystem path with the manifest’s initial context setting (start at 2048).
- A deterministic smoke prompt returns non-empty output using no network access after the model is downloaded.
- Loading, completion, cancellation, and native errors surface as explicit UI states—not only console logs.
- Exactly one context is active. Switching models first releases the old context.
- The diagnostics screen records load duration and completion duration locally; it does not transmit them.

## Sprint 2 — usable local chat

### US-2.1 — create a basic offline conversation

**Owner:** Developer B  
**Priority:** P0  
**Estimate:** 1 day

**As a user,** I can start a text conversation with the active model, read prior turns, and send a new message.

**Acceptance criteria**

- The chat view has a scrolling message list, multiline composer, send control, and empty/loading/error states.
- Sending adds a user message immediately and creates an assistant placeholder.
- Empty/whitespace-only messages cannot be sent. Sending is disabled unless a ready model is active.
- Conversation state is kept locally and is restored after relaunch.
- The implementation uses a lightweight custom UI first; do not add a chat framework unless it demonstrably reduces work without conflicting with streamed updates.

### US-2.2 — format prompts for the selected model

**Owner:** Developer B, reviewed by Developer A  
**Priority:** P0  
**Estimate:** 0.75 day

**As a user,** my conversation is rendered in the format expected by the model, so roles and turn boundaries are understood correctly.

**Acceptance criteria**

- A pure prompt-builder maps stored `system`, `user`, and `assistant` messages to the selected model manifest’s template.
- The initial catalog supports its tested template; ChatML is used only for models that declare ChatML.
- Unit tests cover empty conversation, system prompt, alternating turns, a prior assistant response, and special-character user input.
- The app applies a documented context-window policy: retain the system prompt and most recent complete turns, display a notice when old turns are omitted, and never silently corrupt turn order.

### US-2.3 — stream output without freezing the UI

**Owner:** Developer B  
**Priority:** P0  
**Estimate:** 1.25 days

**As a user,** I see the assistant response appear progressively while I can still scroll and stop generation.

**Acceptance criteria**

- The engine token callback appends to an in-memory buffer.
- Render commits are batched to at most one per animation frame (approximately 16 ms); React state is not updated for every token.
- The active assistant message updates in order and finalizes when generation ends.
- A visible Stop control cancels the active completion, retains the partial response, and restores the composer.
- A device test with a response of at least 500 generated tokens shows no sustained UI freeze.

### US-2.4 — make lifecycle and memory behavior safe

**Owner:** Developer A  
**Priority:** P0  
**Estimate:** 1 day

**As a user,** backgrounding the app or leaving the chat does not leave unsafe inference work or an unrecoverable UI state.

**Acceptance criteria**

- On AppState transition away from active, generation is cancelled/suspended according to the library’s supported API; the UI says the generation was interrupted.
- On returning to foreground, the app verifies the context state and offers a clear reload action if it was released or invalidated.
- Leaving the active chat/model session releases the context using the library’s supported release method.
- The app does not attempt background inference.
- Manual tests cover background/foreground during model loading, during generation, and with an idle loaded model on both devices.

**Important:** do not call release merely because a visual route changes if the agreed product experience expects an instant return to the same chat. The first release will release on explicit model switch, memory warning where available, and app background; release-on-navigation is an optional conservative mode to validate after measuring reload time.

### US-2.5 — finish the MVP experience

**Owner:** Developer B  
**Priority:** P1  
**Estimate:** 1 day

**As a user,** I understand the app’s local-only behavior and can recover from routine errors without developer help.

**Acceptance criteria**

- First-run onboarding clearly states that models and conversations stay on-device and model download requires internet.
- User-visible errors cover unavailable storage, download/network failure, checksum failure, model load failure, and interrupted generation, each with a recovery action.
- Controls expose only tested settings: temperature, maximum output tokens, and reset conversation. Advanced context/threads controls are not exposed in the MVP.
- Basic accessibility is present: labelled controls, readable contrast, dynamic-text sanity check, and screen-reader-friendly streaming status.

## Stretch — only after all P0 stories pass

### US-3.1 — ask about an image with a compatible model

**Owner:** Both  
**Priority:** P2  
**Estimate:** 1–2 days

**As a user,** I can attach an image and ask a compatible local vision model about it.

**Acceptance criteria**

- Vision support is gated behind a separately declared compatible model and required multimodal-projector artifact, each downloaded and checksum-validated.
- The app requests photo access only when the user chooses to attach an image, and uses a local file URI supported by the inference library.
- Text-only models cannot show the image attachment control.
- The team validates memory behavior independently; vision support does not destabilize text chat.

## Explicit non-goals for this release

- Accounts, server-side inference, telemetry containing content, or cloud sync.
- Siri/Shortcuts, keyboard integration, widgets, and background generation.
- Arbitrary model imports or user-provided URLs.
- Multi-model concurrent loading, RAG/document chat, tool calling, voice, and image generation.
- App Store / Play Store distribution. Produce device-installable builds first; store compliance is a follow-up project.

## Release gate

The two-week MVP is ready for internal testers when all P0 stories pass on the agreed iPhone and Android test devices, the model can be downloaded/validated/loaded after a fresh install, a 10-turn offline chat streams and persists across a restart, and the background/interruption tests show clear recovery rather than a crash or silent failure.
