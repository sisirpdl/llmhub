# Platform UI redesign

## Presentation

Android follows the supplied PocketPal references: near-black canvas, black top app bar, drawer navigation with local conversation history, lavender section headings, compact outlined model cards, green offload action, floating catalog button, model-picker and discovery sheets, and an anchored multiline composer. iOS uses a separate shell with Chat, Models and Settings bottom tabs, large navigation titles, grouped model rows, safe-area spacing, and padding-based keyboard avoidance. Shared components adapt card and control geometry without duplicating model or chat behavior.

Dark appearance is the first-run default; Dark, Light and Follow system are persisted locally. LLMHub keeps its name and supported catalog. Discovery browses Hugging Face GGUF repositories with Trending/Most downloaded/Browse, Text/Vision/All and phone-size filters. Local GGUF and direct HTTPS file imports are also implemented. A listed model is not a guarantee of engine compatibility. Voice, Pals, and benchmarking were not implemented as decorative controls.

## Shared behavior

- `AppController.tsx` owns navigation and preferences.
- `useModelController.ts` owns catalog states, downloads, verification, loading, offloading, and native lifecycle handling.
- `useChatController.ts` owns streaming, native message/context selection, retrieval context and saved conversations. Model sampling profiles are handled by `modelSettings.ts`.
- Metro resolves `AppShell.android.tsx` and `AppShell.ios.tsx` from the extensionless AppShell import.
- Existing single-chat and v2 history migrate into the v3 store with native OpenAI messages and separate UI metadata. Existing generation settings and onboarding state are preserved.
- Switching models releases the previous context before allocating another. Backgrounding during loading invalidates the result; backgrounding with a loaded model stops and releases it. A load failure offers Retry load rather than redownloading the model.
- Vision downloads use the projector's actual URL, size and checksum; total progress includes both artifacts. Startup checks both the model and projector before offering Load.

## Chat actions and settings

Android's header ⋮ opens Export chat; Import chat is in the main drawer. iOS uses a native export action sheet and an import entry in its Conversations sheet. Export/import uses one portable JSON chat document, with supported images embedded for transfer. See [CHAT_IMPORT_EXPORT.md](CHAT_IMPORT_EXPORT.md).

The composer model chip and adjacent settings control remain. App Info and engine diagnostics are the final Settings section rather than a separate destination/tab. Settings also includes Manage local documents for Markdown/TXT keyword retrieval. The latest response's source names are displayed; a navigable source viewer and verified citations are planned.

The current shells use custom React Native navigation. Native-stack migration, iOS collapsing large titles/swipe-back and Android new-chat FAB refinement remain planned. Native inference, persistence and validation stay shared; platform layouts/navigation use separate files.

## Run

```sh
npm ci
npm run android
# On macOS, install/update pods after native dependency changes:
cd ios
bundle exec pod install
cd ..
npm run ios
```

`react-native-svg` supplies vector icons. Other runtime dependencies include the system document picker, image picker, filesystem/checksum libraries, AsyncStorage, safe-area support and the browser-compatible GGUF parser; `package.json` is the authoritative list. No web-preview dependencies are included in the app.

## Verification

Type checking, lint and Jest cover shared chat streaming, legacy history migration, concurrent-send prevention, stopped partial output, model switching, background release, interrupted loading, projector download metadata, Android drawer navigation and iOS tabs/history. Browser presentation previews use mocked native inference and filesystem APIs and cannot certify native behavior.

Physical-device checks still required:

- Build on Android and iOS, including SVG autolinking and iOS pods.
- Check light/dark/system appearance, font scaling and screen-reader labels.
- Test composer with the keyboard open, portrait/landscape and safe-area insets.
- Download, validate, load and delete a text model; verify progress and storage recovery.
- Stream a long answer; scroll away from the bottom and use Scroll to latest.
- Open Models or Settings during generation, then return to the same chat; stopping should preserve partial output.
- Start a new chat, reopen the old chat from history, restart the app and verify both survive.
- Export/import text and image chats with Android document providers and iOS Files; cancellation must retain the current chat.
- Import a Markdown/TXT document, query it offline, check source labels and cancel during retrieval.
- Check the header export action, import navigation, composer settings and App Info at the end of Settings.
- Background while loading, generating and idle; return and reload.
- Verify the vision preview separately on a compatible physical device.

Do not treat a simulator or web preview as evidence that local native inference passed on a phone.
