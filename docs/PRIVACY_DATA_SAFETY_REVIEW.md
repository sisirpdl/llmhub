# Privacy and Google Play Data Safety review

Reviewed October 22, 2026 against this source tree and Google's current official guidance. Source review is complete. Production approval is **blocked** by the items below. No Play Console declarations, live database settings, public policy hosting, release binaries, or packet captures were changed or verified in this review.

## Data inventory

| Flow and destination | Data leaving the device | Trigger / storage | Evidence |
| --- | --- | --- | --- |
| Local inference and retrieval | None in local mode | Chats/settings in AsyncStorage; images, documents, extracted text, models in app files; report drafts local | `src/chat/useChatController.ts`, `src/chat/attachments.ts`, `src/documents/`, `src/settings/` |
| Hugging Face API | Search query, repositories/files requested, IP/network metadata; optional bearer token on initial HTTPS Hub origin only | Model browsing, GGUF inspection and downloads; provider/CDN retention unknown | `src/models/huggingFace.ts`, `ggufMetadata.ts`, `hfAuth.ts`, `modelStore.ts` |
| Custom model URL and redirected download hosts | Requested URL/file, network metadata; no intentional HF token for another initial origin | User-selected download; redirect credential behavior requires release-device capture | `src/models/importedModels.ts`, `modelStore.ts`, native download library |
| Supabase HTTPS Edge Function and private database | UUID receipt, schema version, title, description, reproduction steps; app version/platform/OS only if opted in | Explicit Submit report; selected response is editable prefill; drafts are not submitted automatically | `src/support/issueReport.ts`, `responseReport.ts`, `submitIssueReport.ts`, `IssueReportSheet.tsx`, `supabase/functions/submit-issue-report/handler.ts` |
| Chosen LAN host | Text prompt/history, system/developer instructions, selected document passages, inference settings, model ID, access key and network metadata | User connects and sends; plaintext HTTP; host may retain data; images/tools rejected | `src/lan/protocol.ts`, `useLan.ts`, native LanHttp modules |
| Nearby peer | Model files, model offer/manifest, transfer IDs/progress and network metadata | Explicit pair/accept; authenticated encrypted control messages and model chunks over local HTTP; no chat history or HF token | `src/nearby/session.ts`, `protocol.ts`, native nearby modules |
| OS share/export recipient | User-selected portable chat JSON or connection/pairing details | Explicit export/share; saved copies and recipient retention outside app control | `src/chat/chatTransfer.ts`, `src/lan/useLan.ts`, nearby pairing |

No advertising/analytics SDK is declared in package.json, and no automatic conversation upload to the report endpoint appears in these paths. This is source evidence, not a certification of all native dependencies or provider logs. Android backup is disabled in the manifest. Camera permission supports user-selected image/QR actions; there are no declared contacts, microphone or location permissions in the main manifest. Check the **merged release manifest**, bundled native SDKs and iOS privacy report before shipping.

## Data Safety worksheet

These are source-derived answers, subject to the live-service evidence identified below. Google's collection definition includes transmission to third parties, not just the developer's own server. Local-only processing is excluded; ephemeral off-device processing still belongs in the form. User-initiated transfer and service-provider sharing exceptions require their actual conditions to be met.

| Form item | Answer / rationale for this build |
| --- | --- |
| Collects or shares user data | **Yes**: optional reports and network features exist. Do not select no collection merely because inference can be local. |
| Report content | Declare **App activity → Other user-generated content**, collected, optional, not ephemeral, for **App functionality** (customer support). Unstructured support reports are not ordinary person-to-person messaging. |
| Optional app/platform/OS details | Declare **App info and performance → Diagnostics**, collected, optional, not ephemeral, for **App functionality**. No automatic crash-log collection is implemented. |
| Model search requests | Account for **App activity → In-app search history** transmitted to Hugging Face. Optional feature; app functionality. Do not assume provider processing is ephemeral without evidence of its retention. |
| LAN text/history/document excerpts | Account for **Other user-generated content**, collected for optional app functionality. Do not claim ephemeral processing for arbitrary hosts whose retention is unknown. |
| Identifiers | Receipt UUID identifies a report, not a persistent user/device installation. No advertising ID or stable device ID is intentionally collected. Verify provider logs and token/account association before concluding that no additional identifiers apply. |
| Free-text personal/sensitive data | Reports and LAN text may contain personal data. Review actual supported uses against Google's specific data-type definitions; do not assume all health, financial, identity or contact data is covered by the generic content category if the product starts soliciting it. Do not submit private samples to public trackers. |
| Shared with third parties | Supabase may qualify as a service provider; explicit LAN/export/nearby actions may qualify as user-initiated transfers. Document contracts, disclosures and expected recipient behavior before relying on exceptions. HF/CDN independent processing must also be reviewed; source alone cannot settle the global sharing answer. |
| All collected data encrypted in transit | **No** while LAN chat uses HTTP. HTTPS reports and encrypted nearby payloads do not cover LAN prompts/access keys. This also needs a transport-security fix or feature removal for release; an accurate form answer alone does not resolve the User Data policy issue. |
| Deletion requests supported | An in-app request route exists; verify operator receipt, identification and deletion before declaring the process operational. No app account exists and no account-creation flow needs account deletion. |
| Sold / advertising / tracking | No intentional sale, advertising, or cross-app tracking in reviewed application code. Confirm contracts/provider behavior rather than treating absence of an SDK as proof of all external behavior. |
| Independent security review | No such review verified; do not claim certification. |

## Retention and deletion findings

The database migration restricts anon/authenticated access, bounds fields and rate limits new reports; the Edge Function accepts only allowlisted fields and uses server credentials privately. Diagnostics start off. Selected response text is prefilled for user review, so the report sheet now distinguishes it from other messages rather than claiming no chat text is ever prefilled. The public Markdown, HTML and in-app policy have synchronized wording, search/CDN disclosures, explicit no-automatic-expiry language, and report-deletion instructions.

**Current retention:** report rows have no TTL or scheduled purge. They remain until an operator deletes them. No finite deadline or guaranteed deletion SLA is promised by the policy. A recommended operating policy is 90 days for report rows and 30 days to handle deletion requests, but those are proposals, not deployed behavior or user promises. The release owner must adopt and enforce a finite period and review Supabase logs/backups before publishing a shorter retention promise.

**Operator deletion procedure:** receive a report titled `Delete my report`; use the original receipt ID to locate the row through authorized backend access. Ask for minimal ownership evidence if needed; possession of an unauthenticated UUID alone is not an authenticated user identity. Delete the verified original and the deletion-request row using privileged support tooling; do not grant mobile/anonymous clients database delete access. Check provider logs, backups, exports and incident copies separately, record only minimal audit evidence, and explain residual backup retention. Uninstalling the app removes local data, not submitted reports. There is no contact channel in the anonymous form for sending a confirmation, which must be resolved operationally if confirmation is required.

## Release blockers and evidence still required

1. **Transport:** add authenticated TLS for LAN chat or disable that feature in the release; packet-capture prompts, history, access keys and responses. Keep the current plaintext disclosure until fixed.
2. **Backend operations:** verify deployed RLS/grants/RPC/Edge Function; submit a synthetic report with diagnostics off/on, verify exact private row contents, then exercise deletion. Adopt/enforce retention; confirm log and backup periods. This environment has no authenticated Supabase administration connection.
3. **Public disclosures:** publish the synchronized HTML at a public HTTPS URL, verify unauthenticated access and use it in Play Console. Supply a monitored developer support/privacy contact that works outside the app. Hosting and console state were not accessible here.
4. **iOS:** `ios/LlmHub/PrivacyInfo.xcprivacy` currently has an empty collected-data array despite optional support reporting. Assess Apple's optional-disclosure rules against the actual submission UI, update the manifest/App Store privacy answers as applicable, and inspect the merged Xcode privacy report. Do not infer Apple answers from Google's taxonomy.
5. **Release verification:** inventory transitive native dependencies, test redirects for token leakage, capture all network destinations with local chat, HF search/download, custom URL, reports, LAN and nearby, and inspect actual provider log practices. Reconcile every supported feature with the declaration worksheet; no blanket no-sharing answer is justified yet.
6. **Model verification:** run curated/imported models on the release device, including vision and multilingual/paraphrase prompts. Heuristic tests verify the publication boundary for matching text; they cannot prove all unsafe semantics are detected.

## Official references

Consulted October 22, 2026:

- [Google Play Data Safety definitions, types, sharing exceptions and encryption](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Apple collected-data manifest categories](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
- [Apple manifest purposes](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes)

## Validation

Run `npm test -- --runInBand`, `npm run typecheck`, `npm run lint` and `npm run test:issue-endpoint`. Privacy-policy parity is checked in `src/support/privacyPolicy.test.ts`; report opt-in/allowlist/retry tests and endpoint rejection tests cover the source-level collection boundary. Release-device and live-provider evidence remains explicitly unverified above.
