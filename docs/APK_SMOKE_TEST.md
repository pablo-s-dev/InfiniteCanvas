# APK Smoke Test Checklist

Use this after building:

```powershell
npm run build:android:apk
```

APK path:

```txt
android\app\build\outputs\apk\release\app-release.apk
```

Optional install command:

```powershell
adb install -r android\app\build\outputs\apk\release\app-release.apk
```

## Core App

- [ ] App launches without a crash.
- [ ] Home/library screen opens.
- [ ] Create a drawing.
- [ ] Draw one stroke.
- [ ] Erase one stroke.
- [ ] Select, copy, and paste a path.
- [ ] Insert an image.
- [ ] Save, return to library, and reopen the drawing.

## Import And Export

- [ ] Export one drawing as JSON.
- [ ] Share one drawing JSON through the Android share sheet.
- [ ] Import one `.infinitecanvas.json` file from the Android file picker.
- [ ] Import an invalid JSON file and confirm a user-friendly error appears.

## Google Drive Sync

Requires the Android OAuth client/SHA-1 to be registered for package
`com.PabloS.InfiniteCanvas`.

- [ ] Google Sign-In opens.
- [ ] Drive app-data permission is requested.
- [ ] New drawing uploads to Drive.
- [ ] Edited drawing syncs again.
- [ ] Locally deleted uploaded drawing queues and deletes remotely.
- [ ] Failed sync shows the failed badge and retries after reconnect.
- [ ] Conflict badge opens the local/cloud comparison dialog.

## Embed Regression

Run web dev server:

```powershell
npm run dev:local -- web
```

- [ ] Embedded Memory Copilot iframe receives `READY`.
- [ ] Host can send `INIT`.
- [ ] Host receives `UPDATES` while drawing.
