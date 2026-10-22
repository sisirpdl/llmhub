# Safety, privacy and security implementation

Last source review: October 22, 2026, including these changes against `main` at `dbaaa13`.

This document records protections present in the code and their limits. It
separates AI content safety from data privacy, transfer security and input
validation. It is not a certification of model safety, a penetration-test report,
or confirmation of Play Store approval or a live backend deployment.

## At a glance

| Area | Implemented | Limit |
| --- | --- | --- |
| Local input checks | Small set of explicit harmful requests in the newest user message, including LAN hosting. | No output filtering; model behavior determines generated content. |
| AI response reporting | Selected assistant-response text opens an editable report form. | Requires configured and deployed report backend; does not block harmful output. |
| Transparency | AI accuracy notice and in-app privacy policy in About app. | Notices do not enforce model behavior. |
| Local processing | Local inference and document retrieval; no account required. | Explicit report submission sends data off the phone; LAN inference is disabled in the first release. |
| Report privacy | Diagnostics off by default; no automatic full-chat, image, document or log attachment. | Selected response text can itself contain personal or retrieved information. |
| Report backend | HTTPS submission, validation, private table, retry deduplication and global admission cap. | Public project key is not user authentication or bot protection. |
| Nearby sharing | Authenticated encryption, bounded chunks, final checksums and receiver acceptance. | Sender-provided hashes alone cannot establish publisher identity. |
| LAN inference | Disabled in the first release; no settings entry or active request handlers, and start/connect operations are blocked. | Deferred implementation remains in source and must be reviewed before enabling. |
| Imports and resources | Format/size checks, bounded PDF extraction and file-size browsing guidance. | These checks are not a sandbox, content moderation or a RAM-fit guarantee. |

## 1. AI response reporting and user review

Assistant messages with text provide **Report response** on both platforms through
the shared chat UI. The action opens the report sheet; it does not send anything
automatically.

- The title defaults to “Offensive or unsafe AI response”.
- The description contains only text from the selected response, limited to 4,000
  characters with a truncation notice when necessary.
- The reproduction field identifies the model and asks why the output is unsafe.
- The user can edit the form and remove personal information before submitting.
- Other messages, images, source documents and tokens are not automatically added.
  A selected response may still quote sensitive material, so review is important.
- Optional diagnostics are off by default and contain only app version, platform
  and OS version.
- Successful submission displays a reference ID; failed submission keeps the
  draft for explicit retry. Drafts are not uploaded automatically on restart.

Implementation: [chat UI](../src/chat/ChatView.tsx),
[screen wiring](../src/app/Screens.tsx),
[response draft](../src/support/responseReport.ts),
[report form](../src/support/IssueReportSheet.tsx),
[draft validation](../src/support/issueReport.ts).

Reports support manual investigation. No automatic moderation queue, report-driven
model blocking or automated safety updates are implemented.

## 2. AI limitations and document prompt handling

About app tells users that AI responses can be inaccurate, asks them to verify
important information, and points to response reporting. The default system prompt
remains “You are a helpful assistant.” Users can change system prompts and models.

Retrieved document passages are supplied as temporary reference context with an
instruction to treat source text as untrusted material rather than instructions,
and to cite sources. This is a prompt-level precaution, not a reliable security
boundary or guarantee against prompt injection or fabricated citations.

Tool calls can be preserved in imported history, but the core prompt preparation
does not execute tools and rejects unresolved or mismatched tool-call sequences.
LAN mode explicitly rejects tools and structured-output requests.

Implementation: [settings](../src/settings/modelSettings.ts),
[retrieval context](../src/chat/useChatController.ts),
[prompt preparation](../src/chat/promptBuilder.ts),
[LAN request validation](../src/lan/protocol.ts).

### Content-safety protections not implemented

Minimal local input heuristics cover selected explicit requests involving child sexual exploitation, non-consensual sexual content, self-harm methods, violence, illegal wrongdoing and concealment of a crime. Only the newest user message is checked in chat and LAN hosting. Prior messages, custom system prompts and retrieved document passages are not scanned by this filter. Normalization handles capitalization, spacing, punctuation and zero-width characters. Educational topic mentions and support-seeking statements are left to the model. The safety system instruction is still added to local and LAN inference prompts.

There is **no app-level output content filtering**. Tokens stream to the chat UI in animation-frame batches; completed text, reasoning and tool-call metadata are preserved without content screening. LAN model output is returned unchanged. Stop, background/error handling and per-generation late-callback guards remain, but they do not moderate content. Model refusals and safety instructions are the primary output safeguards; their effectiveness has not been established across supported/imported models.

There is still no semantic or multilingual classifier, image moderation, age verification, jailbreak-resistant safety layer or completed safety evaluation across supported/imported models. Different models can have different
refusal behavior. Reporting, local execution, checksums and disclaimers do not
establish that a model is safe or compliant with distribution policies.

## 3. Local data and privacy boundaries

Chats, imported documents, extracted text, chat images and model files use private
app storage. Local inference and document retrieval run on the phone. Android app
backup is disabled. Private app storage is not a claim of app-managed encryption
at rest or protection on a compromised device.

The app provides chat/document/model deletion. Exported files and copies saved
outside the app have their own lifecycle and must be deleted separately.

Network features have explicit boundaries:

- Model browsing/downloads contact Hugging Face or the selected provider.
- LAN mode sends conversation context and selected retrieved passages to the
  chosen host. The host owner controls that device and may retain data.
- Report submission sends the reviewed form and opted-in diagnostics to support
  through Supabase.
- Nearby model sharing transfers model artifacts and transfer metadata, not chat
  history or the Hugging Face token.

The Hugging Face token is kept in memory rather than persisted in AsyncStorage.
The authentication helper attaches it only when the initial request URL is the
HTTPS Hugging Face origin. This origin check alone is not proof of every native
download client's redirect behavior; audit redirects when changing providers or
network libraries.

Implementation: [privacy policy](../src/support/privacyPolicy.ts),
[Android manifest](../android/app/src/main/AndroidManifest.xml),
[token settings](../src/settings/HuggingFaceTokenSettings.tsx),
[token headers](../src/models/hfAuth.ts). See the
[publishable privacy-policy text](privacy-policy.md).

## 4. Report submission and backend protections

The mobile app sends reports to an HTTPS Supabase Edge Function. Client
configuration accepts the expected Supabase HTTPS origin and publishable-key
format. The service-role credential is server-side only.

The handler accepts POST JSON, caps the body at 32 KiB, rejects unexpected fields,
and validates the receipt ID, schema version, required text, field lengths and
diagnostics allowlist. It returns generic backend failures rather than database
error details. The handler does not deliberately log report bodies.

The migration enables row-level security, revokes anonymous/authenticated table
access and grants RPC execution to the service role. Database constraints enforce
text lengths. Identical retries reuse their receipt and return the same ID;
different content under an existing ID is rejected. The client shows success only
when the server returns its expected receipt.

The database transaction admits at most **100 new reports globally per rolling
hour**, without charging identical retries. This limits accepted database writes;
it does not prevent Edge Function invocation costs, identify users or stop one
client exhausting the allowance. The publishable key is public project
configuration, not an anti-abuse secret. Stronger abuse controls remain work for a
broad rollout.

These protections require applying the migration and deploying/configuring the
function. Empty app configuration disables submission; checked-in source does not
prove the operator's live configuration. Submitted reports remain until support
deletes them; no automated retention/deletion schedule is implemented. Privacy
questions and deletion requests use Report an issue, with the reference ID when
available.

Implementation: [client](../src/support/submitIssueReport.ts),
[handler](../supabase/functions/submit-issue-report/handler.ts),
[migration](../supabase/migrations/20261010220000_issue_reports.sql).
Deployment instructions: [issue reports](ISSUE_REPORTS.md).

## 5. Nearby model-transfer security

Nearby sharing uses a native-generated 192-bit pairing secret, independent from
LAN-inference credentials. Domain-separated derivation produces the authorization
value and AES-256 key. Control payloads and model chunks use AES-GCM with fresh
nonces and associated data binding each payload to its request and transfer
position. The pairing secret itself is not sent in HTTP headers.

Receivers review the offer and explicitly accept it before transferring model
files. Chunks are bounded to 256 KiB, native file paths are restricted to managed
model/incoming directories, and completion checks file size, GGUF header and
SHA-256 before installation. Partial files do not become installed models merely
because bytes arrived. Pairing/session cleanup and partial-transfer recovery are
implemented.

Encryption does not hide network addresses, HTTP headers, timing or ciphertext
lengths. Possession of the QR code/pairing secret grants access. A sender's hash
proves consistency with that sender's offer, not publisher authenticity. Only a
complete size/hash match against the receiver's bundled catalog receives that
independent source verification; arbitrary peer models remain unverified.

Implementation: [protocol](../src/nearby/protocol.ts),
[session](../src/nearby/session.ts), [storage](../src/nearby/storage.ts),
[Android crypto/file bridge](../android/app/src/main/java/com/llmhub/ModelTransferFiles.kt),
[iOS crypto/file bridge](../ios/LlmHub/ModelTransferFiles.swift).
Details and device-test matrix: [nearby transfer](NEARBY_TRANSFER.md).

## 6. LAN inference controls and limits

LAN hosting requires a session bearer key. Client address validation accepts
private IPv4 origins and permitted ports. Requests are bounded and validated,
unsupported media/tools are rejected, one completion runs at a time, and
concurrent-socket, request-size and timeout limits constrain resource use.
Stopping or backgrounding the session closes hosting and invalidates its key.

**LAN inference is not encrypted.** Bearer keys, prompts, retrieved passages and
responses cross HTTP. Use trusted networks and hosts; authorization does not stop
network observers. The Android manifest permits cleartext traffic for local
features; this is a platform allowance, not network-level enforcement that every
HTTP request is local. Nearby payload encryption does not protect LAN chat.

Implementation: [LAN validation](../src/lan/protocol.ts),
[lifecycle](../src/lan/useLan.ts),
[Android transport](../android/app/src/main/java/com/llmhub/LanHttpModule.kt),
[iOS transport](../ios/LlmHub/LanHttp.mm).
Protocol limits: [LAN hosting](LAN_HOSTING.md).

## 7. Import and resource protections

Chat imports validate the OpenAI document structure and enforce size/format
limits. External image references are not fetched automatically; unsupported media
is preserved for export rather than silently executed. PDF extraction has page and
text limits, cancellation and error handling. These reduce malformed-input and
resource risks; they do not sandbox native PDF or GGUF parsers.

Model download paths perform checksum verification against expected metadata.
Storage checks reserve headroom. “Likely fits” uses an 80% app-RAM-budget file-size
heuristic, including projector size where applicable. It does not calculate actual
KV-cache/buffer use, change with context settings or guarantee a successful load.

Implementation: [chat format](../src/chat/chatDocument.ts),
[chat transfer](../src/chat/chatTransfer.ts),
[PDF extraction](../src/documents/pdfText.ts),
[model verification](../src/models/modelStore.ts),
[fit guidance](../src/models/deviceSuitability.ts).

## Verification and remaining work

Automated tests cover response-report selection/truncation, diagnostics opt-in,
report validation/retries/receipts, endpoint rejection paths, encrypted-transfer
tampering and recovery, LAN validation, chat import boundaries, PDF limits and
Hugging Face header scoping. Relevant suites include `responseReport.test.ts`,
`issueReport.test.ts`, `submitIssueReport.test.ts`, nearby protocol/session/storage
tests, `lan/protocol.test.ts`, `chatTransfer.test.ts`, `promptBuilder.test.ts`,
`pdfText.test.ts`, `hfAuth.test.ts`, and `scripts/issue-endpoint.test.cjs`.

At this review, the 11 selected Jest suites passed (92 tests), and all 4 mocked
issue-endpoint checks passed. Source files used for these checks were matched by
Git blob hash against the reviewed `main` snapshot. No native-device or live
Supabase deployment tests were run for this documentation change.

Before claiming production readiness:

- Evaluate harmful-output safeguards across curated and user-imported models;
  reporting alone does not prevent prohibited generation.
- Verify report submission, permissions and deletion procedures against the live
  Supabase project; choose and implement a report-retention policy.
- Add stronger anonymous-report abuse controls as needed for rollout scale.
- Record physical Android/iOS and cross-platform LAN/nearby tests, including crypto
  interoperability, backgrounding, tampering, low storage and connection loss.
- Verify the signed release bundle and native dependencies, including 16 KiB page
  compatibility. JavaScript tests do not validate native binaries.
- Reassess privacy disclosures and store declarations whenever data flows change.

See [release checklist](play-store-release.md) and
[device-test notes](DEVICE_TEST_NOTES.md) for release validation. This documentation
does not deploy a backend, introduce moderation or change runtime behavior.

## October 22 regression and privacy review

See [privacy and Data Safety review](PRIVACY_DATA_SAFETY_REVIEW.md) for the source inventory, declaration worksheet and unresolved release blockers. Category and paraphrase fixtures are in `src/chat/safety.test.ts`; streaming/lifecycle regressions are in `src/chat/ChatView.test.tsx`. Tests use non-operational mocked output and do not establish that models will reliably refuse unsafe requests. No output detection is implemented.

## First-release LAN scope

`LAN_INFERENCE_ENABLED` is false in `src/app/releaseFeatures.ts`. The app hides Host & Connect, rejects hosting/connection attempts and skips LAN inference listeners. Local inference, downloads and encrypted nearby model-file sharing remain available. Native networking code is retained because nearby sharing uses its transport; this is runtime feature disablement, not removal of all networking code. Privacy disclosures reflect this scope. LAN-specific descriptions earlier in this document refer to the deferred implementation.
