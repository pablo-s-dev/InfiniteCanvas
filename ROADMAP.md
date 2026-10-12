# InfiniteCanvas Roadmap

This roadmap tracks missing or incomplete work after the 1.1.0 alpha refactor,
Expo SDK 57 upgrade, Android project regeneration, and APK build pass.

## Current Baseline

- Standalone library/home surface exists.
- Embedded Memory Copilot canvas flow exists through `postMessage`.
- Canvas document schema is versioned with `CANVAS_DOCUMENT_VERSION`.
- Local drawing persistence exists through `drawingRepository`.
- Export, share, import, duplicate, delete, rename, and tag flows exist.
- Selection clipboard actions exist for path selections.
- Google Drive web sync has sign-in, upload, listing, download, and conflict UI.
- Google Drive Android sync can request a native Google token and reuse the same
  Drive REST logic.
- Android release APK builds with the Expo SDK 57 / React Native 0.86 stack.

## P0 - Reliability And Release Readiness

### Add Automated Tests

Initial Vitest coverage exists for document schema, repository behavior, import
parsing, sharing payloads, sync queue behavior, and composite tags.

Still missing broader coverage:

- Google Drive sync success/failure paths.
- Home screen interaction tests.
- Canvas gesture/selection behavior.
- Android smoke tests.

### Stabilize Android Build Environment

The APK now builds, but the build is sensitive to local machine setup.

Done:

- Documented required JDK 17 setup in `docs/ANDROID_BUILD.md`.
- Documented `GRADLE_USER_HOME=D:\gradle-cache` and `TEMP/TMP=D:\temp`.
- Added repeatable `android:apk` and `android:apk:arm64` scripts.
- Verified `android:apk:arm64` produces a release APK through the script.

Still needed:

- Keep monitoring CMake path length warnings from New Architecture codegen.

### Fix Low-Disk Failure Mode

The full Android build failed once because `C:` had almost no free space while
Gradle and Prefab wrote to `C:\Users\pibli\.gradle` and `%TEMP%`.

Done:

- Build scripts route Gradle cache and temp files to `D:`.
- Added cleanup notes for Gradle/Android temporary files.
- Build script warns when `C:` has less than 5 GiB free before a universal APK
  build.

## P1 - Product Features

### Native Google Drive Sync On Android

Android now has a native Google Sign-In adapter through
`@react-native-google-signin/google-signin`. It requests the Drive app-data
scope, reuses the existing Drive REST upload/list/download logic, and refreshes
cached native tokens once after a Drive `401`.

Done:

- Add Expo-compatible native Google auth.
- Reuse the existing Drive REST upload/list/download logic after auth.
- Handle one native token refresh path after Drive `401`.
- Verify the Android release APK still builds after adding the native auth
  module.

Still needed:

- Register the Android OAuth client/SHA-1 for the current signing key.
- Test sign-in and sync from an installed APK.

### Offline Sync Queue

The app now has a persisted local sync queue for Drive upload/delete work.

Done:

- Persist a queue of local changes that need upload.
- Queue remote deletes for locally deleted drawings that were already uploaded.
- Retry queued sync when online and signed in while the app is open.
- Mark drawings with pending, synced, failed, and conflict states.
- Avoid losing queued work when the app closes.
- Add retry/backoff behavior for Drive API failures.

Still needed:

- Add OS-level native background sync if the product needs retry while the app is
  fully closed.
- Smoke test queue retry from an installed APK after OAuth Android is registered.

### Import UX And Conflict UX Polish

Import/export and conflict resolution exist, but need hardening.

Done:

- Make invalid import errors user-friendly and localized.
- Show imported drawing counts clearly.
- Show conflict comparison metadata before choosing local vs cloud.

Still needed:

- Consider previewing local vs cloud versions before choosing.

### Android Share And File Workflows

Export/share exists, but Android-specific flows should be verified.

Done:

- Added user-friendly fallback errors when native JSON import/share APIs are not
  available.

Needed:

- Verify JSON export/share from APK.
- Verify JSON import from Android file picker.
- Verify clipboard image paste behavior on Android.

## P2 - Architecture And Maintainability

### Split The Canvas Out Of `App.tsx`

The architecture doc says the drawing implementation still lives in root
`App.tsx`. That is still true.

Suggested slices:

- canvas state and history
- pointer/touch gesture handling
- selection and resize behavior
- clipboard actions
- image paste/import actions
- embed protocol bridge
- toolbar/menu components

### Localize Remaining User-Facing Strings

The project has an i18n file, but many UI messages remain hardcoded in feature
files.

Done:

- Moved current home sync/import/export bulk-action strings into
  `src/shared/i18n/i18n.ts` or language-aware format helpers.
- Moved standalone canvas-shell drawing detail/export/share labels into the
  localization flow.

Needed:

- Localize remaining legacy canvas toolbar/context-menu strings in root `App.tsx`.
- Keep English, Portuguese, and Spanish entries aligned as new strings are added.
- Avoid adding more direct user-facing strings in components.

### Refresh Documentation

Some docs no longer match the code.

Done:

- Updated `docs/GOOGLE_DRIVE_SYNC.md` to reflect download/conflict support.
- Added `docs/ANDROID_BUILD.md` for Expo SDK 57 APK builds.
- Added `docs/DEVELOPMENT_SETUP.md` for the root path:
  `D:\Computer-Science\Projects\All\InfiniteCanvas`.
- Added `docs/EMBED_CONTRACT.md` with Memory Copilot embed examples.

### Clean Up Deprecated Or Legacy Dependencies

The build shows warnings from native dependencies and one package deprecation.

Candidates:

- `react-native-vector-icons`
  - package warns that it moved to per-icon-family packages.
- `@react-native-community/slider`
  - Android manifest uses deprecated `package` attribute.
- old slider packages
  - verify whether both slider packages are still needed.

Do this after tests exist, because these changes can affect UI behavior.

## P3 - Quality Of Life

### Add Project Scripts

Done:

- `android:apk`
- `android:apk:arm64`
- `doctor`
- `verify`
- `verify` now runs typecheck, Vitest, and Expo Doctor without failing on the
  intentionally versioned native project folders.

Still useful:

- Add a smoke-test script once emulator automation is in place.

### Improve Build Artifact Notes

Done:

- Document APK output path.
- Document the difference between debug-signed local APKs and Play Store signing.
- Document when to build universal APK vs arm64-only APK.

### Add Smoke Test Checklist

Manual APK smoke test should cover:

Done:

- Added `docs/APK_SMOKE_TEST.md` covering app launch, drawing, erase,
  select/copy/paste, image insert, save/reopen, JSON import/export, Google Drive
  sync, and embed regression.
