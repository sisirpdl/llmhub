# Report an issue

Android's main sidebar provides **Report an issue**. iOS provides it in the header's themed navigation menu. Settings does not duplicate this action. The form collects a title, description and optional reproduction steps. Basic app/platform/OS versions are optional and off by default; users can see the exact details before including them. Chats, documents, model files, tokens and logs are never collected automatically.

**Save draft** writes one draft to private AsyncStorage. Closing a changed form asks before discarding unsaved edits. **Submit report** saves the draft first and sends it over HTTPS to the configured Supabase Edge Function. Success appears only after a matching server receipt; the saved draft is then cleared. Failed submissions keep the draft for explicit retry. Old drafts are never uploaded automatically.

## Configure and deploy

The path is `IssueReportSheet → submit-issue-report Edge Function → private issue_reports table`. No Supabase SDK or new native dependency is required.

1. Create a Supabase project. From its API keys settings, copy the project URL and **publishable** key (`sb_publishable_…`). Fill `src/support/reportBackend.json`:

   ```json
   {
     "supabaseUrl": "https://YOUR_PROJECT_REF.supabase.co",
     "publishableKey": "sb_publishable_YOUR_KEY"
   }
   ```

   Use the URL without a trailing slash. These values are public client configuration. Never put a secret or service-role key in the mobile app. Empty configuration disables Submit while preserving local draft saving.

2. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). From this repository's root, connect your project, apply the migration and deploy:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   supabase secrets set ISSUE_REPORT_PUBLISHABLE_KEY='sb_publishable_YOUR_KEY'
   supabase functions deploy submit-issue-report
   ```

   `ISSUE_REPORT_PUBLISHABLE_KEY` must match the app configuration. The hosted function already receives `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; do not add the service-role key to the app or manually override these built-in variables. Alternatively, run the complete `supabase/migrations/20261010220000_issue_reports.sql` in the SQL Editor before deploying. If you already created the table using the earlier example, this migration preserves it and adds the required RPC and permissions.

3. Reload the app's JavaScript, then open Report an issue. Fill the form and press Submit report. Confirm a row in Supabase's Table Editor and the confirmation in the app. A distributed build must include the filled configuration.

## Request and access rules

The app sends JSON with `id`, `version: 1`, `title`, `description`, `steps` and optional `diagnostics`. The function accepts only these fields, validates lengths and diagnostics, and caps the request body at 32 KiB. Receipt time comes from Postgres rather than the phone. The public key goes in the `apikey` header. `supabase/config.toml` disables JWT verification for this anonymous endpoint; the handler checks the configured publishable key. A publishable key identifies the project, not the user, and is not an anti-spam secret.

Row-level security is enabled, with no client read or insert policies. The function uses its server-side service-role credential to call `submit_issue_report`. Only the service role can execute that RPC. Database errors and report contents are not logged by the handler or returned to clients.

The app saves a pending receipt ID before sending. An unchanged retry reuses it, including after a restart or lost response. Postgres returns the same ID for an identical report and rejects a changed payload under an existing ID. IDs are deduplication identifiers, not authentication credentials.

The database atomically admits at most **100 new reports globally per rolling hour**. Identical retries do not consume the allowance. This is a basic volume cap: one abusive client can exhaust it, and it does not limit Edge Function invocations. Add stronger abuse controls before a broad public rollout. Screenshot attachments, automatic crash logs and user accounts remain outside this feature.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm test -- --runInBand` and `npm run test:issue-endpoint`. Endpoint tests mock the Supabase REST service; they do not run the migration or deploy a live function.

After deploying, verify on both platforms:

- A report creates one private row, shows success and clears the saved draft.
- App details are absent unless the user enabled them.
- Airplane mode keeps the saved draft; reconnecting and explicitly retrying succeeds.
- A retry after an uncertain response uses the same receipt ID and creates no duplicate row.
- The public client key cannot read or directly insert rows in `issue_reports`, or execute `submit_issue_report`.

Review reports through the Supabase dashboard or an administrative backend. Define a retention period for submitted descriptions before releasing publicly.
