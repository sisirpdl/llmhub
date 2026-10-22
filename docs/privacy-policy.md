## LLMHub privacy policy · October 22, 2026

LLMHub runs language models locally and does not require an account. This policy describes local storage and the optional network features. For privacy questions or deletion requests concerning submitted reports, use Report an issue in the main sidebar. Use the title Delete my report and include the original report ID if available; do not resend private content. This requires network access and review by support.

## Chats, documents and images

Chats, downloaded models, imported documents, extracted text and chat images are stored in private app storage. Local inference and document retrieval happen on this device. These files are not automatically sent to LLMHub support. You can delete chats, documents and models in the app. Clearing app storage or uninstalling removes app-local data; exported files or copies saved elsewhere must be deleted separately. Android app backup is disabled.

## Downloads and Hugging Face

Browsing and downloading models contacts Hugging Face or the download provider you select. Providers receive network information such as your IP address, search queries, requested repositories and files, and apply their own privacy policies. Downloads may redirect to provider storage or CDN hosts. An optional Hugging Face token is sent to Hugging Face to authorize requests. LLMHub keeps this token in memory rather than saving it to app storage. Do not enter a token you cannot safely use for downloads.

## Nearby model sharing

Chat inference runs on this device. Remote inference and LAN hosting are not available in this release. Nearby model sharing transfers model files and transfer metadata directly between participating devices. Control messages and model chunks are encrypted and authenticated before transfer. Chat history, document passages and your Hugging Face token are not included in model transfers.

## Reports sent to support

Submitting a report sends the title, description and reproduction steps to LLMHub support through an HTTPS Supabase endpoint. If you opt in, it also sends app version, platform and OS version. Report response fills the form with the selected response text for your review; it does not automatically include the full conversation, images or documents. Remove personal information before submitting. Drafts remain on your device until you submit or delete app storage. Submitted reports are stored in a private support database for up to 30 days in the active database, then automatically deleted. Supabase provider logs and backups may have separate retention periods. You may request deletion sooner through Report an issue; include the original report ID if available, but do not resend private content. Deleting the app or its local data does not delete submitted reports.

## Data use and security

Reports are used to investigate bugs and unsafe AI output. LLMHub does not include advertising or analytics SDKs in this release and does not sell your reports or local chat data. Private app storage relies on your device security. HTTPS protects report submission in transit; database access is restricted to the support backend. The app does not automatically upload conversations for model training.
