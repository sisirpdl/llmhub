# Chat import/export and native messages

## One interchange format

```json
{
  "model": "qwen3-4b-q4_k_m",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Explain photosynthesis" },
    { "role": "assistant", "content": "Photosynthesis is…" }
  ]
}
```

One JSON file contains one conversation. No CSV, transcript-text, vendor-specific export or ZIP format is introduced. The document's model is an identifier, not bundled weights or a command to download a model. Importing does not replace model settings or execute tools.

## Storage and inference doctrine

`ChatDocument` in `src/chat/chatDocument.ts` defines `{ model, messages }`. Messages retain OpenAI roles, string/typed content, names, assistant `tool_calls`, tool `tool_call_id` and extension fields such as `reasoning_content`.

Conversation records add UI metadata alongside this payload: title, display IDs, timestamps, response attribution and switch dividers. These do not live in the messages array and are not exported or passed to inference. System instructions live in actual system messages, not a separately persisted prompt string.

The v3 history store persists native messages. Both ordinary completions and the load smoke check pass messages to llama.rn's embedded template formatter. There is no application ChatML/text-prompt serializer in the core path. Context selection retains message objects and complete user-turn/tool groups; it still uses a character-based approximation, not exact token accounting. Oversized newest turns get an error rather than silent truncation. Text models filter image parts from the submitted context while saved/exported content remains intact.

Legacy v2/single-chat data receives a one-time migration: images become `image_url` parts, system instructions become system messages, and model-switch events become separate UI metadata. Existing titles/history/response attribution are retained. Unreadable current history is never overwritten or replaced with stale legacy data. Old keys remain recovery backups; clearing a chat must clean those backups after a successful current-store write.

Future LAN/SDK/P2P chat-document interfaces must use this same document rather than add converters. Model-file sharing and document-index data have their own artifact protocols; this chat format does not imply that LAN/SDK/P2P are implemented.

## User controls

- Android: chat header **⋮ → Export chat**; main drawer **Import chat**.
- iOS: header **⋮** uses ActionSheetIOS; **Import chat** is in the Conversations sheet, matching its tab/history navigation.
- Export opens the system save dialog. Import opens the system document picker and adds/selects a new conversation; existing chats are retained.
- Model settings remain beside the composer model chip. The header menu does not open settings.
- App Info and engine diagnostics are the final section of Settings, removed from Android destinations and iOS tabs.

Export contains private chat text and supported images. Choosing a provider/destination in the system dialog is the user's explicit file-saving action; Hub does not send chats to a hosted inference service.

## Images and other parts

Images use standard typed parts:

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What is in this picture?" },
    { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}
```

Export embeds app-owned PNG/JPEG/WebP images as data URLs. Import materializes inline images in private chat storage and keeps the same typed-part structure; only their storage URI changes at the file boundary. Arbitrary local paths cannot be imported or read during export. HEIC images need conversion before export; this change adds no image-conversion dependency.

HTTPS image references are retained for re-export, but are neither rendered remotely nor sent for automatic fetching. A continuation that needs them returns an explanation. Unsupported media parts (such as audio/file inputs) are preserved but do not become supported inference merely by importing them.

Tool calls/results remain structured and are never executed by import. Completed tool histories can pass through the native formatter, subject to the chosen model/template. Unresolved calls or unmatched results block continuation with an actionable error; history stays exportable. Generated tool calls/reasoning, when returned by the engine, are retained without introducing a tool executor.

## Limits and recovery

- Maximum file size: 32 MiB, including embedded images; maximum messages: 10,000.
- Top-level import fields are exactly model and messages. Invalid roles/content/tool-call structures produce an error before registration.
- Selected files are staged locally and validated. Failed imports clean staged/new image files; history is committed before changing the visible conversation.
- Picker/save cancellation is a no-op. Save errors clean temporary exports and leave chat history untouched.
- Stop generation before import/export. Models are not silently downloaded or loaded after import; choose an installed model to continue.
- Titles, switch dividers, sampling settings, model weights and the local document index are intentionally outside the portable chat document. Retrieved source snippets are runtime reference context; they are not persisted into or bundled with the exported messages. An imported title is derived from its first user message.

## Physical verification

Export/import a text chat and an inline-image chat using Android document providers and iOS Files. Cancel both dialogs; test invalid JSON, full storage, relaunch and imported tool history. Verify native built-in Qwen formatting after the move to messages, vision/projector behavior, and no automatic external-image network request. Automated native mocks and JS bundles do not certify these hardware flows.

No native dependency was added; the existing document-picker module provides both open and save dialogs. Install the previous native picker update first. A Metro reload is enough for this change when that module is already installed.

## Local document attachments

Chat-specific document selections are local metadata, outside `{model, messages}`. Export includes the generated answer but does not bundle PDF originals, extracted text, indexes or local document IDs. Imported chats start without document attachments; attach files from the local library before asking document questions. See [PDF_RAG.md](PDF_RAG.md).
