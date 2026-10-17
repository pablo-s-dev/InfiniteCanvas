# Project Map

## Purpose
An Expo/React Native application for creating and editing infinite-canvas drawings.

## Requirements
- Support Android and web; iOS scripts are also configured.
- The add-tag icon uses the active theme's contrasting primary text color in both dialogs.
- Existing project instructions require localized user-facing strings where appropriate and hover tooltips on web buttons.
- Home Cloud Sync status shows only the count of drawings needing sync, or a synced confirmation; it does not open a status modal.
- Android debug Cloud Sync is configured to call a local Worker at `http://127.0.0.1:8788`; physical-device loopback is forwarded with `adb reverse`.

## Components
- `AppEntry.js` registers `src/shell/InfiniteCanvasApp.tsx` as the Expo root.
- `src/features/canvas/CanvasEditor.tsx` is the compatibility entry for the canvas editor.
- `src/features/documents/components/SaveNewDrawingDialog.tsx` renders the save dialog and uses `TagChipPicker`.
- `src/features/documents/components/DrawingDetailsDialog.tsx` also uses `TagChipPicker`.
- `src/features/tags/components/TagChipPicker.tsx` renders tag chips and the add-tag button; its icon color uses `styles.dialogButtonPrimaryText.color`.
- `src/shared/ui/dialogStyles.ts` supplies themed styles used by the tag picker.
- `src/features/home/components/SyncSummary.tsx` renders passive Cloud Sync status; `src/features/home/syncSummary.ts` counts local-only, pending, failed, conflict, and foreign-account drawings once each.
- `worker/` and `wrangler.jsonc` are present for the sync backend; details not inspected.

## Main Flow
`AppEntry.js` -> registers `InfiniteCanvasApp` -> canvas/editor UI -> save drawing dialog -> `TagChipPicker` -> add-tag callback.
`DrawingDetailsDialog` -> shared `TagChipPicker` -> add-tag callback.

## Data and Trust Boundaries
- The app calls the Worker; the Worker accesses Google Drive and verifies Google Play purchases.
- Android stores the revocable app session in SecureStore.
- `.env.local` points Android to local Worker port 8788; current ADB device has port reversals for 8081 and 8788.
- Worker health endpoint responded successfully during debugging. Cloud Sync auth, Drive credentials, and entitlement remain unverified.
- A supplied Android logcat excerpt shows repeated `FATAL EXCEPTION` events in process `com.google.android.gms`, in Google Play services while querying installed applications. The excerpt does not show an app-process exception or corresponding Worker request.
- A later log reports `Finsky ... installed but certificate mismatch` and `InfiniteCanvasUpdate ... ERROR_APP_NOT_OWNED (-10)`, which is from the Play in-app update check for an app not installed/acquired from the matching Play listing; it is not evidence of a Cloud Sync request failure.
- `NativeUpdatePrompt` checks for updates on app launch and whenever the app returns to the active state. The `ERROR_APP_NOT_OWNED (-10)` warning immediately after the Google sign-in activity closes is from that independent update check.
- In Android development builds, `googleDriveSync.ts` logs Cloud Sync sign-in failure stage and safe error code/status to Logcat with the `[CloudSync]` prefix. It does not log messages, response bodies, identity, authorization codes, or tokens.
- Cloud Sync error toasts show only localized, plain-language messages and a dismiss action; diagnostic details remain developer-only.
- Current login diagnostic is `stage=google_sign_in`, `code=10` (`DEVELOPER_ERROR`). App and Worker Web OAuth client IDs are configured and match. Android signing report identifies the debug SHA-1 as `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`; registration of this package/fingerprint in the Google Cloud Android OAuth client remains unverified.
- User provided SHA-1 `C1:A8:C8:B7:6A:D0:20:E2:A7:51:3D:19:D1:94:64:24:74:72:69:29` for the EAS/upload key and `92:19:84:A2:3B:FA:16:89:78:5C:77:70:64:E0:CB:78:F8:03:A9:B9` for the Play key. They are different, as expected for Play App Signing (upload vs app-signing certificate).
- `android/app/build.gradle` selects the release upload signing config only when all `ANDROID_UPLOAD_*` variables are set. The `signingReport` was run without them, so its release SHA-1 fell back to the debug key; this does not establish which key a successful AAB build uses.
- For OAuth Android sign-in, register the same package with the debug SHA-1 for local installs, and the Play app-signing SHA-1 for Play-installed builds. The upload SHA-1 is needed for directly installed APKs signed with the upload key.

## Build and Deployment
- `npm run typecheck`
- `npm test`
- `npm run build:web`
- Android, iOS, and local worker scripts are defined in `package.json`.
- `npm run worker:dev` starts Wrangler in local mode on port 8788.

## Unknowns
- Persistence and sync data flows.
