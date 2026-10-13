export const privacyPolicy = [
  {
    title: 'LLMHub privacy policy · October 13, 2026',
    text: 'LLMHub runs language models locally and does not require an account. This policy describes local storage and the optional network features. For privacy questions or deletion requests concerning submitted reports, use Report an issue in the main sidebar and include your report ID if available.',
  },
  {
    title: 'Chats, documents and images',
    text: 'Chats, downloaded models, imported documents, extracted text and chat images are stored in private app storage. Local inference and document retrieval happen on this device. These files are not automatically sent to LLMHub support. You can delete chats, documents and models in the app. Clearing app storage or uninstalling removes app-local data; exported files or copies saved elsewhere must be deleted separately. Android app backup is disabled.',
  },
  {
    title: 'Downloads and Hugging Face',
    text: 'Browsing and downloading models contacts Hugging Face or the download provider you select. Providers receive network information such as your IP address and requested files and apply their own privacy policies. An optional Hugging Face token is sent to Hugging Face to authorize requests. LLMHub keeps this token in memory rather than saving it to app storage. Do not enter a token you cannot safely use for downloads.',
  },
  {
    title: 'LAN connections and nearby sharing',
    text: 'Connecting to another device sends your prompts, conversation context and selected document passages to the chosen LAN host. That host processes them; its owner controls the device and may retain data. LAN HTTP traffic is not encrypted, so use only a trusted network and host. Nearby model sharing transfers model files and transfer metadata directly between participating devices. Model chunks are encrypted and authenticated before transfer. Chat history and your Hugging Face token are not included in model transfers.',
  },
  {
    title: 'Reports sent to support',
    text: 'Submitting a report sends the title, description and reproduction steps to LLMHub support through an HTTPS Supabase endpoint. If you opt in, it also sends app version, platform and OS version. Report response fills the form with the selected response text for your review; it does not automatically include the full conversation, images or documents. Remove personal information before submitting. Drafts remain on your device until you submit or delete app storage. Submitted reports are stored in a private support database until support deletes them; request deletion through Report an issue. Supabase may process request metadata under its own privacy policy.',
  },
  {
    title: 'Data use and security',
    text: 'Reports are used to investigate bugs and unsafe AI output. LLMHub does not include advertising or analytics SDKs in this release and does not sell your reports or local chat data. Private app storage relies on your device security. HTTPS protects report submission in transit; database access is restricted to the support backend. The app does not automatically upload conversations for model training.',
  },
];
