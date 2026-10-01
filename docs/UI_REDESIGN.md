# Platform UI redesign

## Presentation

Android follows the supplied PocketPal references: near-black canvas, black top app bar, drawer navigation with local conversation history, lavender section headings, compact outlined model cards, green offload action, floating catalog button, model-picker and discovery sheets, and an anchored multiline composer. iOS uses a separate shell with bottom tabs, large navigation titles, grouped model rows, safe-area spacing, and padding-based keyboard avoidance. Shared components adapt card and control geometry without duplicating model or chat behavior.

Dark appearance is the first-run default; Dark, Light and Follow system are persisted locally. LLMHub keeps its name and supported catalog. Discovery searches and filters the existing manifests; it does not imply arbitrary Hugging Face imports. Voice, Pals, and benchmarking were not implemented as decorative controls.

## Shared behavior

- `AppController.tsx` owns navigation and preferences.
- `useModelController.ts` owns catalog states, downloads, verification, loading, offloading, and native lifecycle handling.
- `useChatController.ts` owns streaming, prompt construction, generation settings and saved conversations.
- Metro resolves `AppShell.android.tsx` and `AppShell.ios.tsx` from the extensionless AppShell import.
- Existing `@llmhub/conversation` messages migrate into the versioned conversation store. Existing generation settings and onboarding state are preserved.
- Switching models releases the previous context before allocating another. Backgrounding during loading invalidates the result; backgrounding with a loaded model stops and releases it. A load failure offers Retry load rather than redownloading the model.
- Vision downloads use the projector's actual URL, size and checksum; total progress includes both artifacts. Startup checks both the model and projector before offering Load.

## Run

```sh
npm ci
npm run android
# On macOS, update the pods after adding react-native-svg:
cd ios
bundle exec pod install
cd ..
npm run ios
```

`react-native-svg` is the only added runtime dependency, used for consistent vector icons rather than platform-dependent Unicode glyphs. No web-preview dependencies are included in the app.

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
- Background while loading, generating and idle; return and reload.
- Verify the vision preview separately on a compatible physical device.

Do not treat a simulator or web preview as evidence that local native inference passed on a phone.
