# Play Store release checklist

## Standalone phone testing without USB or Metro

From the repository root:

```sh
cd android
./gradlew assemblePreview
```

Transfer `android/app/build/outputs/apk/preview/app-preview.apk` from your computer to your phone using Quick Share or another file-transfer method, then open it on the phone to install. Android may ask you to allow installations from the app opening the APK.

This variant bundles JavaScript and assets, disables developer support, and uses the existing debug keystore, so it does not need Metro, USB, or upload-signing credentials. It installs as **LLMHub Preview** (`com.llmhub.preview`) alongside the regular app. Its storage is separate: download/import models again, or use nearby model sharing. Stop hosting in the other app before testing LAN hosting to avoid port conflicts. Rebuild and reinstall the APK whenever code changes. Internet is still needed for model downloads and report submission; local chat works offline after downloading a model.

Use the signed release AAB below for Google Play, not the preview APK.

## Upload signing

Release builds no longer use the debug signing certificate. Create an upload key and keep it backed up outside the repository:

```sh
keytool -genkeypair -v -keystore "$HOME/llmhub-upload.jks" -alias llmhub-upload -keyalg RSA -keysize 2048 -validity 10000
```

Set these values in your private `~/.gradle/gradle.properties` (or environment). Do not commit passwords or keys:

```properties
LLMHUB_UPLOAD_STORE_FILE=/absolute/path/to/llmhub-upload.jks
LLMHUB_UPLOAD_STORE_PASSWORD=your-store-password
LLMHUB_UPLOAD_KEY_ALIAS=llmhub-upload
LLMHUB_UPLOAD_KEY_PASSWORD=your-key-password
```

Build from `android` with `./gradlew bundleRelease`. Output: `android/app/build/outputs/bundle/release/app-release.aab`. Enroll in Play App Signing. If the package already exists in Play Console, use its registered upload key instead of generating a replacement. The application ID is `com.llmhub`; finalize it before first publication. Increase Android `versionCode` for every subsequent uploaded release.

## Before submission

- Host `docs/privacy-policy.html` as a public webpage, enter its URL in Play Console, and review the policy against your deployed backend. Apply and verify the 30-day support-report purge migration before publishing; provider logs and backups may have separate retention. The app contains the same policy text under Settings → About app.
- Include your local Supabase URL and publishable key in `src/support/reportBackend.json`. Never put a service-role key in the app. Test a real report and verify private database insertion and deletion requests.
- Review AI safety: the app has local input/output safeguards, reporting and an accuracy notice, but these do not guarantee that every model blocks prohibited output. Evaluate the curated and imported models before production.
- Verify actual native libraries in the signed AAB support 16 KB pages; test on a 16 KB device/emulator and review Play Console compatibility results. API target is 36; do not assume SDK/NDK versions prove native compatibility.
- Test the release installed through Play internal testing: model download/load, airplane-mode chat, stop/background behavior, PDFs, image permissions, chat deletion, report response, nearby transfer, and confirm LAN hosting/remote inference are unavailable.
- Confirm launcher/store graphics are your final branding and curated model distribution complies with model licenses.

## Play Console

- Complete developer/account verification and confirm production access. New personal accounts created after November 13, 2023 need 12 continuously opted-in closed testers for 14 days before applying for production access.
- Provide app name, descriptions, icon, feature graphic, screenshots and support contact.
- Complete Data safety accurately for optional reports and all network features; on-device inference alone does not imply no data collection. Do not claim all data is encrypted in transit while LAN chat uses HTTP.
- Complete privacy URL, ads declaration, target audience, content rating, app access and any AI declarations shown by Play Console.
- Explain to reviewers how to download an accessible model and start chat without a Hugging Face token.
- Review the pre-launch report and compatibility warnings before requesting production review. Submission does not guarantee immediate publication.

Official references: [User data](https://support.google.com/googleplay/android-developer/answer/10144311), [AI content](https://support.google.com/googleplay/android-developer/answer/13985936), [Signing](https://developer.android.com/studio/publish/app-signing), [16 KB pages](https://developer.android.com/guide/practices/page-sizes), [Testing eligibility](https://support.google.com/googleplay/android-developer/answer/14151465).

## Privacy review evidence

See [October 22 privacy and Data Safety review](PRIVACY_DATA_SAFETY_REVIEW.md) for the data-flow inventory, declaration worksheet and release blockers. LAN hosting/remote inference are disabled for the first release. Verify that scope in the signed build; report retention/deletion operations, public policy hosting, remaining transports and live provider behavior still require verification.
