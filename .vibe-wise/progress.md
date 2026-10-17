# Learning Progress

## Topic: Theme-aware styles
- Introduced: `AppThemeProvider` exposes the active palette; `useDialogStyles()` derives themed styles on render.
- Demonstrated understanding: the learner identified that `TagChipPicker` is shared by both dialogs and applied `styles.dialogButtonPrimaryText.color` to its plus icon.
- Needs reinforcement: Not assessed yet.
- Implementation: the plus icon now uses the active theme's primary text color; this affects both Save drawing and Drawing details. `npm run typecheck` passed.

## Topic: Cloud Sync Android routing
- Introduced: Android's Cloud Sync API URL comes from `EXPO_PUBLIC_CLOUD_SYNC_API_URL`; `127.0.0.1` on a physical device reaches the development computer only when ADB reverse forwards the port.
- Demonstrated understanding: learner suggested that the app might be calling a local endpoint.
- Verified: `.env.local` configures host `127.0.0.1`; local port 8788 serves the Worker health endpoint; connected Android device has reverse mappings for ports 8081 and 8788.
- Additional evidence: supplied logcat excerpt (19:43-19:45) has repeated crashes in `com.google.android.gms` at `getInstalledApplications`; Google sign-in activities are launched around the same time. No app-process exception or correlated Worker request appears in the excerpt.
- A subsequent log at 20:37 shows `InfiniteCanvasUpdate` failing Play in-app update with `ERROR_APP_NOT_OWNED (-10)` and Finsky reporting certificate mismatch. This points to the sideloaded/debug app's Play update check, not Cloud Sync.
- Confirmed in code: `NativeUpdatePrompt` starts an update availability check at launch and when the app returns to `active`; this explains why its warning appears after Google Sign-In returns.
- Added Android debug-only Cloud Sync sign-in diagnostics. They log stage, code, and HTTP status (when available) without raw messages, response bodies, identity, OAuth codes, or tokens. Verification: `npm run typecheck` passed; runtime behavior still needs a fresh login attempt.
- Captured login diagnostic: `{"stage":"google_sign_in","code":"10"}`. In Google Sign-In Android, code 10 is `DEVELOPER_ERROR`; failure occurs in native Google sign-in before OAuth authorization-code exchange with the Worker. Locally configured app and Worker Web OAuth client IDs match. `app.json` package is `com.PabloS.InfiniteCanvas`; Gradle debug SHA-1 is `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Need verify the matching Android OAuth client registration in the same Google Cloud project.
- User supplied `C1:A8:C8:B7:6A:D0:20:E2:A7:51:3D:19:D1:94:64:24:74:72:69:29` as EAS/upload SHA-1 and `92:19:84:A2:3B:FA:16:89:78:5C:77:70:64:E0:CB:78:F8:03:A9:B9` as Play SHA-1; distinct upload/app-signing keys are expected with Play App Signing.
- Correction: Gradle `signingReport` showed release signed by debug key because `ANDROID_UPLOAD_*` variables were absent from that process. The release build config signs with the upload key only when all four variables exist; otherwise it falls back to debug. This alone does not verify the AAB actually uploaded or produced.
- Google OAuth Android clients should cover debug SHA-1 for local builds and Play app-signing SHA-1 for Play-installed builds. Upload SHA-1 is additionally needed when directly installing APKs signed by the upload key.
- Needs reinforcement: whether the Google Play services crash causes sign-in failure; actual app-side result, entitlement, Drive OAuth credentials, and sync request failure remain unknown.

## Topic: Copyable Cloud Sync diagnostics
- Historical implementation: in Android debug mode, the toast once copied a small diagnostic JSON object through Expo Clipboard.
- Current implementation: removed clipboard/debug detail UI; the toast contains only localized, plain-language status and a dismiss button. Safe developer diagnostics stay in the developer console.

## Topic: Home Cloud Sync status and per-drawing recovery
- Requirement: show only how many drawings need syncing, or that all are synced; remove the awkward retry/close pending-items popup.
- Implementation: `countUnsyncedDrawings` counts each local-only, pending, failed, conflicted, or foreign-account drawing once. `SyncSummary` is now a passive row and renders a localized count or synced confirmation. Per-drawing copy-to-account recovery remains in the drawing options dialog for foreign-account drawings.
- State and interaction: tapping the summary no longer opens a modal; the separate Cloud Sync action still runs the existing main sync action. Foreign-account copy dispatches to `copyToCurrentAccount` and is disabled while sync work is busy.
- Product copy: localized error and purchase states remain plain-language; raw error details are not rendered in the app.
- Verification: `npm run typecheck`, `npm test` (13 files, 66 tests), `npx vitest run src/features/home/syncSummary.test.ts` (2 tests), and `npm run build:web` passed. Metro and the local Worker remain running.
