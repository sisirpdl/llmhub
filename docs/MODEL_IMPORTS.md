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

## Device-aware discovery and chat

The Hub browser opens on Trending + Text. Trending and Most downloaded request 10 repositories at a time; Browse requests 20. Most downloaded uses the Hub's monthly download metric. Search text remains when changing rank or Text/Vision/All. Show more follows the Hub's pagination cursor without sending tokens to another API host.

Repository files default to **Supported**. This means an estimated RAM fit, not certified engine compatibility. The calculation uses GGUF architecture metadata, model weights, FP16 KV cache at the selected context length, working buffers, projector/image overhead, and safety margins. Unrecognized architectures, missing metadata, or unavailable native memory readings stay **Unknown** under All. Metadata uses cancellable HTTP ranges, capped at four 2 MB responses per file; files requiring larger headers stay Unknown. Two files are inspected concurrently and compact parsed architecture metadata is cached in memory.

Android reads system memory plus the app's current PSS and reserves OS headroom; the budget is capped at 60% of physical memory. iOS uses `os_proc_available_memory` plus the app's current physical footprint, with a similar cap and reserve. These are conservative heuristics and require calibration on physical devices. They do not promise that every model classified as fitting can load. System memory pressure and engine architecture support can still cause a load failure.

Storage filtering is independent. A RAM-suitable variant remains visible with a storage icon and shortfall when there is not enough disk space. The download action is disabled for a known shortfall. Projector selection and context length change the estimate. Vision estimates remain Unknown until a projector with a known size is selected.

Model settings are beside the abbreviated model chip in the composer. Edits and Reset are staged; Cancel discards them. Apply validates and saves a per-model profile, with temperature, output tokens, top-p, top-k, min-p, repetition penalty, seed, and context length. Changing the active context reloads the model. A storage failure while saving settings attempts to restore the previous loaded context. App defaults are displayed explicitly. System instructions are saved with the conversation.

Tap the chat title to rename it. The first message supplies a title only until the user renames it manually. The subtitle shows the loaded model and quantization; the composer chip is the switching control. Successful model switches preserve messages, add a divider, and attribute subsequent replies to their model. The picker warns before switching image history to a text model. Text models receive accompanying text; vision models receive saved images for retained turns. Images are copied into private app storage, resized through the image picker, and referenced in the persisted conversation. Opening the image picker does not immediately unload the active model.

Android uses underline tabs and rounded task chips; iOS uses segmented controls and its existing navigation/tab shell. Both platforms share discovery, inference, persistence, and settings behavior.

### Rebuild after this change

This update adds a native memory reader in both app targets. A Metro reload alone cannot install it. Follow the Android rebuild commands above. On iOS, run `bundle exec pod install` and rebuild the app in Xcode; the memory reader is added to the Sources build phase. The GGUF parser uses its published browser build via Metro to avoid Node-only file-system dependencies.

### Additional phone checks

- Verify Trending/Text defaults, all three tabs, search retention, type filtering, and Show more.
- Compare Supported with All; change context size; select a vision projector; confirm RAM status updates.
- Test low storage: the fitting variant remains visible and the download action is disabled.
- Check that a missing native module or unavailable GGUF metadata shows Unknown rather than a false compatibility claim.
- Open model settings while a download is updating. Edits must stay staged; Cancel and Reset/Apply must behave correctly.
- Rename an empty chat and send its first message; the custom topic must remain.
- Switch text → vision → text in one chat. Check dividers, model attribution, saved images after restart, and warnings.
- Change context length and verify a reload, retained history, and recovery after a failed load.
- Verify memory budget readings and load behavior on the physical Android phone and an iPhone; JavaScript bundle success does not verify native compilation or inference.

## Phone-focused discovery

All three Hub tabs default to models up to 4B parameters. Filters offer up to 8B and Any size, and search retains the selected size range. The API parameter filter is backed by a conservative local check using available GGUF/safetensors totals and parameter counts in repository names. Unknown sizes are excluded from limited lists and remain accessible under Any size. Bounded pagination refills after exclusions while preserving ranking; sparse results can show fewer entries with Show more available. Parameter count is a discovery hint, not a RAM-fit guarantee.

The Supported empty state distinguishes unavailable device memory, missing/unsupported GGUF metadata, missing vision projector, split files, and insufficient RAM headroom. Context chips are explicitly labeled as token counts. A lower-context suggestion appears only when recalculation predicts a fit; unknown estimates never imply incompatibility.
