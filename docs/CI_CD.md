# CI/CD operating guide

## What is active now

`.github/workflows/ci.yml` runs on every pull request to `main`, every push to `main`, and manual dispatch. Repository health validates workflow YAML and requires nonempty README, `docs/PRODUCT_BRIEF.md` and `docs/CI_CD.md`. The app is present, so app quality checks are active: CI requires a committed `package-lock.json` and `.nvmrc` containing `22`, then runs `npm ci`, `npm run lint`, `npm run typecheck`, and `npm test -- --ci --runInBand`. The executable Android Gradle wrapper activates `assembleDebug` with Node 22 and Java 17, retaining the development APK for seven days. The workflow label says unsigned, but this is not production release-signing validation.

`.github/workflows/release.yml` is manual-only. It is a guarded release preflight—not a pretend publishing workflow. It requires the exact signing secrets and native app files for the selected platform before any future release-build jobs can be enabled.

## How to change the pipeline

1. Create a branch from `main`.
2. Change a workflow in `.github/workflows/` or this guide.
3. Open a pull request. The `CI` check must pass before merging.
4. Use the Actions tab to inspect the exact job logs. Do not edit workflows directly on `main` except during an incident.
5. For any permission increase, add a short reason in the PR. Workflows default to `contents: read` and should retain least privilege.

## Reproducible app contract

The app is initialized. Keep these prerequisites committed:

- `.nvmrc` containing `22` (the Node major used by CI).
- `package-lock.json`; this repository standardizes on npm for reproducible CI installs.
- `lint`, `typecheck`, and `test` scripts in `package.json`.
- Executable `android/gradlew` for Android builds.

These prerequisites already exist. Preserve the contract when adding native services or dependencies.

## GitHub configuration to do in the web UI

1. Protect `main`: require pull requests and the `Repository health` and `App quality` checks; disallow force pushes.
2. Create the `internal-release` environment and require approval from both team members before a manual release. The workflow already targets this environment.
3. Restrict Actions to GitHub-authored actions and explicitly approved third-party actions in repository settings.
4. Keep Actions logs private to collaborators. Never paste prompts, conversations, GGUF URLs with credentials, or signing data into logs.

## Signing secrets — add only when release signing is ready

Create these as **environment secrets** in `internal-release`, not repository variables:

| Platform | Secret | Value |
| --- | --- | --- |
| Android | `ANDROID_KEYSTORE_BASE64` | Base64-encoded release `.jks` file. |
| Android | `ANDROID_KEYSTORE_PASSWORD` | Keystore password. |
| Android | `ANDROID_KEY_ALIAS` | Key alias. |
| Android | `ANDROID_KEY_PASSWORD` | Private-key password. |
| iOS | `IOS_CERTIFICATE_BASE64` | Base64-encoded distribution certificate `.p12`. |
| iOS | `IOS_CERTIFICATE_PASSWORD` | `.p12` password. |
| iOS | `IOS_PROVISIONING_PROFILE_BASE64` | Base64-encoded provisioning profile. |

Add these only when release-signing configuration is ready for a non-production validation build. User B should first validate a non-production iOS build on the MacBook; User A should first validate an Android internal build on the physical Android phone.

## Before enabling store distribution

Add a separate reviewed story for the actual build/upload implementation. It must define the distribution target (internal Android testing, TestFlight, Play internal testing), artifact retention, version/build-number policy, certificate rotation, and an emergency rollback path. The release workflow should not upload to a store merely because a branch was merged.


## Validation boundaries

The current workflow has no iOS native-build job, physical-device inference/RAM/thermal test, persistent background-transfer test or store upload. Android assembly does not prove model loading. Production JavaScript bundle checks recorded in [DEVICE_TEST_NOTES.md](DEVICE_TEST_NOTES.md) were separate local checks, not existing CI jobs. Branch protection and environment approvals above are configuration instructions, not confirmed settings.

For docs-only changes, verify local Markdown links, code-block balance, current/planned claims and `git diff --check`. Do not report historical tests as a fresh run. The repository-health workflow checks required documents but does not yet validate all documentation links.
