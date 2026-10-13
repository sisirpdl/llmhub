# Play Store release checklist

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

- Host `docs/privacy-policy.html` as a public webpage, enter its URL in Play Console, and review the policy against your deployed backend. Choose a concrete support-report retention period and implement it if desired; the current policy discloses manual deletion. The app contains the same policy text under Settings → About app.
- Include your local Supabase URL and publishable key in `src/support/reportBackend.json`. Never put a service-role key in the app. Test a real report and verify private database insertion and deletion requests.
- Review AI safety: reporting and an accuracy notice do not prevent prohibited output. Evaluate the curated and imported models and implement appropriate safeguards before production. This patch does not certify AI-policy compliance.
- Verify actual native libraries in the signed AAB support 16 KB pages; test on a 16 KB device/emulator and review Play Console compatibility results. API target is 36; do not assume SDK/NDK versions prove native compatibility.
- Test the release installed through Play internal testing: model download/load, airplane-mode chat, stop/background behavior, PDFs, image permissions, chat deletion, report response, LAN and nearby transfer.
- Confirm launcher/store graphics are your final branding and curated model distribution complies with model licenses.

## Play Console

- Complete developer/account verification and confirm production access. New personal accounts created after November 13, 2023 need 12 continuously opted-in closed testers for 14 days before applying for production access.
- Provide app name, descriptions, icon, feature graphic, screenshots and support contact.
- Complete Data safety accurately for optional reports and all network features; on-device inference alone does not imply no data collection.
- Complete privacy URL, ads declaration, target audience, content rating, app access and any AI declarations shown by Play Console.
- Explain to reviewers how to download an accessible model and start chat without a Hugging Face token.
- Review the pre-launch report and compatibility warnings before requesting production review. Submission does not guarantee immediate publication.

Official references: [User data](https://support.google.com/googleplay/android-developer/answer/10144311), [AI content](https://support.google.com/googleplay/android-developer/answer/13985936), [Signing](https://developer.android.com/studio/publish/app-signing), [16 KB pages](https://developer.android.com/guide/practices/page-sizes), [Testing eligibility](https://support.google.com/googleplay/android-developer/answer/14151465).
