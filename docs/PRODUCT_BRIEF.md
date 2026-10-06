# LLM Hub — product brief

## Identity

LLM Hub is a React Native Android/iOS app for small GGUF language models running on-device through `llama.rn` and llama.cpp. Local inference keeps prompts, images, and responses on the phone. Model discovery and downloads require network access; they must not send conversation content.

PocketPal is the direct design and product reference. The goal is differentiation through offline document knowledge, useful model curation, sharing, and developer access rather than copying every reference feature or claiming a faster engine.

This document records the implemented capabilities and product direction. Technical architecture and future implementation constraints are documented in [ARCHITECTURE.md](ARCHITECTURE.md); hardware validation is tracked in [DEVICE_TEST_NOTES.md](DEVICE_TEST_NOTES.md).

## Current baseline and v1 completion

| Capability | Current state | Next requirement |
| --- | --- | --- |
| Text chat | Streaming, Stop, native OpenAI messages, portable JSON import/export, local history, automatic/manual titles, model attribution and switching. | Full markdown/code highlighting and message edit/regenerate. |
| Local document retrieval | PDF/Markdown/TXT import, chat-specific attachments, cached page-aware chunks, keyword retrieval and latest-response passage inspection. | OCR, embeddings, exact token budgets, persistent provenance and validated citations. |
| Vision | Image attachments saved locally; compatible model/projector loading and switch warnings. | Validate physical-device compatibility and memory independently. |
| Model hub | Hugging Face, local GGUF, direct HTTPS imports; phone-size filtering, variant RAM/storage estimates. | Curated recommendations and measured chip-specific guidance. |
| Settings | Per-model sampling/context settings, conversation system instruction, staged Apply/Cancel/Reset. | Validated advanced chat-template override; retain embedded templates by default. |
| Downloads | Progress, verification, retry and persistent completed models. | Platform-native background transfers and genuine pause/resume. |
| LAN hosting preview | Manual address/key pairing, authenticated OpenAI-compatible text chat, foreground host/client controls. | Native builds/two-device validation, TLS/pinned identity, streaming and discovery. |
| Presentation | Separate Android/iOS shells and discovery controls. | Native-stack navigation, iOS title/back behavior and Android FAB/ripple refinement. |

Chat import/export and its privacy, format and media limits are documented in [CHAT_IMPORT_EXPORT.md](CHAT_IMPORT_EXPORT.md). App Info and engine diagnostics are the final section of Settings; iOS has Chat, Models and Settings tabs.

The current starter packages remain Qwen2.5 1.5B Instruct Q4_K_M and SmolVLM Instruct with its projector. Qwen3 1.7B and SmolVLM 500M are evaluation candidates, not promoted defaults. See [MODEL_IMPORTS.md](MODEL_IMPORTS.md).

A RAM check is guidance, not a guarantee that a model can load. Unknown metadata must remain Unknown. The product goal is to prevent avoidable incompatible downloads without presenting an estimate as a proven hardware result.

## Differentiators in build order

1. **On-device RAG:** expand PDF/Markdown/TXT chat retrieval with OCR, local embeddings and navigable, validated citations. This is the first major differentiator after stabilizing the core; text PDF extraction and chat-scoped keyword retrieval are implemented; OCR and semantic retrieval remain planned.
2. **Curated model hub:** plain-language recommendations, per-device fit checks, and benchmarks tied to exact model/chip configurations. Existing phone-focused discovery is the starting point.
3. **P2P sharing:** a foreground same-WiFi preview implements discovery, explicit pairing, encrypted bounded chunks, resume and final artifact verification. Native/device checks are pending. Publisher verification requires independently trusted receiver metadata; arbitrary peer models remain source-unverified. See [NEARBY_TRANSFER.md](NEARBY_TRANSFER.md).
4. **LAN hosting:** one device explicitly hosts inference for other devices on the same WiFi through an OpenAI-compatible endpoint. A foreground text-only preview now provides manual address/key pairing and completed responses; native/device checks, secure transport, discovery, and streaming remain planned. This opt-in mode has a different privacy boundary; see [LAN_HOSTING.md](LAN_HOSTING.md).
5. **Later multimodal and skills:** extend the existing vision preview toward validated vision/audio and offline tools for notes, reminders, and calendar use.

P2P begins with a reliable direct peer transfer. Multi-peer scheduling is a later expansion of the BitTorrent-style vision; distributed inference across phones is outside v1.

## Long-term platform: an SDK

Offer developers offline AI with no inference API key and no per-token service bill. Applications should request capabilities, such as a chat model of at least 3B parameters, rather than depend on one model filename. The user retains control of which eligible model is used.

| Platform | Intended distribution | Consequence |
| --- | --- | --- |
| Android | Shared hub process with an authenticated localhost OpenAI-compatible service and thin client SDK. | Models can remain in hub-owned storage; service lifetime and caller permissions need a native feasibility spike. |
| iOS | Engine embedded in each consuming app behind the same SDK API. | Model storage and consent belong to that app; no promise of shared Hub files or a persistent cross-app runtime. |

`hub.isAvailable()` must report availability of the usable platform runtime, not merely whether a Hub app appears installed. Android can offer Install Hub when the shared runtime is absent; iOS needs an embedded runtime/model download or a tiny bundled fallback. A Hub installation alone cannot satisfy an unrelated iOS app's model-storage needs.

Permission intent mirrors location access: “JournalApp wants to use your on-device AI — Allow / Deny.” Android needs enforceable caller grants and revocation, not just a dialog in the client app. iOS presents consent within the app embedding the engine. OS-enforced permission infrastructure is not assumed to exist for this custom capability.

First demo integrations:

- Notes: ask questions about a private note collection with offline retrieval and citations.
- Language learning: an offline tutor with personality and appropriate models for underserved or low-resource languages.

Do not lead with generic summarize/rewrite; the brief treats OEM features in that category as a positioning constraint.

## Assistant integration

- **iOS:** plan App Intents/Siri Shortcuts (“ask Hub”), user-configured Action Button/Back Tap entry points, and widgets. Do not position Hub as a replacement for Siri. Validate execution limits; a shortcut or widget is not evidence that long inference can run in the background.
- **Android:** investigate a `VoiceInteractionService` that the user selects as the default digital assistant. Assist gestures initiate push-to-talk. Always-on hotword activation is outside scope without the required system privileges.

## Positioning

| Angle | Role in the plan | Evidence still needed |
| --- | --- | --- |
| Education with offline access | Proposed lead story: a teacher distributes models to student phones over local WiFi. | Teacher interviews, low-end device results, licensing and offline sharing reliability. |
| Enterprise air-gapped use | Revenue hypothesis for environments that prohibit cloud AI. | Buyer discovery, deployment policy, local data handling and support requirements. |
| Travel and children's privacy | Secondary hypotheses. | Specific workflows and demand validation. |
| Journalism | Deprioritized. | Revisit only with a demonstrated need. |

Education is the proposed lead, with enterprise discovery in parallel. This is a planning recommendation, not a validated market choice.

## Competitive research queue

These are comparison targets from the brief; their current features and availability must be verified before making public claims.

| Reference | Question to investigate |
| --- | --- |
| PocketPal AI | Current RAG/sharing capabilities and where Hub meaningfully differs. |
| MLC Chat | Device-specific model compilation, performance and packaging tradeoffs. |
| Google AI Edge Gallery | Beginner UX, supported runtimes and agent/tool experiences. |
| Apple Foundation Models | Where an open model ecosystem complements the platform framework. |
| Google AICore / Gemini Nano | Device/API availability and limits for third-party developers. |
| Ollama / LM Studio | Desktop workflow expectations and current mobile access options. |

“No open cross-device model-agnostic mobile layer” and “PocketPal has no RAG/P2P” are research hypotheses from the brief, not verified marketing claims. Do not publish fastest, universally compatible, or competitor-absence claims without current evidence.

## Constraints and non-goals

- No cloud inference or content telemetry in the core local mode; LAN/SDK modes require their own explicit consent and disclosures.
- No multi-phone model sharding or distributed inference in v1.
- No iOS loopback/x-callback workaround as the platform architecture; App Groups are not a general cross-developer sharing solution.
- No universal tok/s prediction from RAM or parameter count alone.
- No assumption that iOS entitlements, background execution, or extra memory are generally available.
- No default expansion into concurrent model loading; schedule generation/embedding workloads within a measured memory budget.
- Engine replacement is not the primary differentiator. Prioritize RAG, curation, sharing and developer usability.
