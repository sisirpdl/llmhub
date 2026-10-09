# Report an issue

Android's main sidebar and Settings provide **Report an issue**. iOS uses the Settings entry. The form collects a title, description and optional reproduction steps. Basic app/platform/OS versions are optional and off by default; the user can see the exact details before including them. Chats, documents, model files, tokens and logs are never collected automatically.

**Save draft** writes one draft to private AsyncStorage. Closing a changed form asks before discarding unsaved edits. **Clear report** deletes the saved draft after confirmation. **Share report** saves the draft first and opens the native share sheet with a versioned JSON payload. Sharing or cancelling the sheet does not delete the draft or imply submission to LLMHub. No support endpoint, analytics SDK or automatic upload is configured.

`src/support/issueReport.ts` defines the report shape and local draft storage. A future backend can accept `buildIssueReport()` output without collecting more app state. Keep the title/description validation and explicit diagnostics consent when adding submission.

## Suggested backend: Supabase

Use an HTTPS Edge Function to accept reports, validate lengths/schema, enforce abuse controls and insert into a private Postgres reports table. Keep administrative credentials in the function's secrets; never bundle them in the mobile app. Prevent public reads of reports, and avoid unrestricted anonymous direct-table inserts. A public client key is not an anti-spam control.

Define server receipt time and an idempotency/report ID when adding remote submission. Show successful submission only after the server confirms it. Keep failed reports as local drafts and let users explicitly retry. Do not automatically send old drafts after installing a backend-enabled update. Defer screenshot attachments and crash-log collection until their preview, redaction, storage and retention behavior are defined.

Supabase is sufficient for user-written issue reports. A separate crash-reporting service would solve automatic crash collection, which is outside this feature's scope.

References: [Edge Functions](https://supabase.com/docs/guides/functions), [securing data](https://supabase.com/docs/guides/database/secure-data), [function secrets](https://supabase.com/docs/guides/functions/secrets).
