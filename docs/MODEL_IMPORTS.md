# Model discovery and imports

Open Models → + (Android) or Add model (iOS), then select a source.

- **Hugging Face:** search GGUF repositories; filter by author, text/vision task, or gated access; sort by trending, downloads, likes, or latest update. Open a repository to compare GGUF sizes and quantizations. Select a variant, optionally select its matching vision projector, and download. The download action stays visible while browsing variants.
- **Local model:** choose a `.gguf` using the system file picker. Optionally choose a matching vision projector. Files are copied to private app storage, checked for GGUF format, hashed, and registered. The original files are kept.
- **Remote model:** enter a direct HTTPS download URL, optional display name, and optional published SHA-256. This downloads a model for on-device inference; it does not connect to a remote inference API.

Imported models persist across restarts and share the existing load, offload, delete, chat, and download progress controls. Hugging Face downloads are pinned to the repository revision and checked against published LFS SHA-256 digests when available. Without a published checksum, GGUF format is checked and a local checksum is saved for subsequent integrity checks. Imported models use llama.rn's embedded chat-template formatting with structured messages.

Split GGUF shards are shown but cannot be imported. Model size is disk use, not peak RAM use. Not every Hub model or projector is compatible with the installed llama backend. A failed load preserves the file and displays the backend error.

## Install this update on Android

The system picker adds a native module. Install dependencies before rebuilding. Regenerate React Native's cached autolinking files so Gradle discovers the picker:

```bash
cd ~/Desktop/llmhub
npm ci
rm -rf android/build/generated/autolinking android/app/build/generated/autolinking
cd android
./gradlew :app:installDebug -PreactNativeArchitectures=arm64-v8a --no-configuration-cache
```

The architecture flag above is appropriate for the physical ARM64 phone used during development. Omit it or choose the corresponding architecture for another device/emulator.

Keep Metro running in one terminal:

```bash
cd ~/Desktop/llmhub
npm start -- --reset-cache
```

In another terminal, with the phone connected:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.llmhub
adb shell monkey -p com.llmhub -c android.intent.category.LAUNCHER 1
```

On iOS, install dependencies, run `bundle exec pod install` in `ios`, and rebuild the native app.

## Device verification

- Search a repository, change author/sort/task filters, open GGUF variants, and download a small single-file model.
- Verify a gated repository with an authorized read token. Tokens stay in process memory for retries and are not persisted to AsyncStorage.
- Import a local GGUF, restart the app, load it, and chat offline. Repeat with a compatible projector.
- Try a direct URL, then an HTML URL and an incorrect checksum; errors must leave no usable partial import.
- Open the Android keyboard in chat, type several lines, and check that the text, send button, and latest response remain visible. Check the import forms with the keyboard open too.
- Verify iOS sheet scrolling, system file selection, tabs, and keyboard spacing on an iPhone.

Automated checks cover API parsing, pagination restrictions, authorization, import persistence, validation/rollback, local copies, native chat formatting, and existing app/model lifecycle behavior. Physical device and iOS native build checks remain manual.
