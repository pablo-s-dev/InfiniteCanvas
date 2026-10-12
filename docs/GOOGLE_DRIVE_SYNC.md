# Google Drive Sync

InfiniteCanvas uses direct Google Drive API storage. There is no owned backend in this architecture.

## Storage Location

Drawings are stored in the user's Drive `appDataFolder`.

That means files are private to InfiniteCanvas and do not appear in the user's normal Drive file browser. Export can later provide visible copies when users want manual access.

## Runtime Support

The Drive REST upload/list/download implementation is shared by web and native
builds. The only runtime-specific part is acquiring the Google OAuth access
token.

Web uses Google Identity Services. Android uses
`@react-native-google-signin/google-signin` and then calls the same Drive REST
methods.

Create a local `.env.local` file before running Drive sync:

```txt
EXPO_PUBLIC_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

Use the Web OAuth client ID here. Do not copy Google `client_secret_*.json`
files into source control. The client secret is not used by this frontend-only
OAuth flow.

Use the fixed development origin `http://localhost:8081` for web OAuth setup.
The `npm run web` script pins Expo to that port so Google Cloud does not need a
new authorized JavaScript origin every time the dev server starts.

For Android device sign-in, Google Cloud also needs an Android OAuth client
registered for:

- package name: `com.PabloS.InfiniteCanvas`
- SHA-1 fingerprint for the signing key used by the APK being tested

The local APK currently uses the generated Android debug keystore signing
configuration. A Play Store build will need the Play/App signing SHA-1
registered separately.

## Data Shape

Each drawing is uploaded as:

```txt
<drawing-id>.infinitecanvas.json
```

The JSON payload is the versioned `CanvasDocument` shape from `src/features/canvas/document.ts`.

## Sync Model

The app is local-first:

- drawings save locally immediately;
- local create/edit/delete operations are persisted into an offline sync queue;
- sync uploads queued local drawings when signed in;
- sync deletes queued remote Drive files for locally deleted drawings that had
  already been uploaded;
- sync lists and downloads remote drawings from Drive `appDataFolder`;
- Drive file and revision IDs are stored in drawing metadata;
- revision conflicts are surfaced in the home UI for user resolution.
- Android can request a native Google token and refresh cached native tokens
  once after a Drive `401`.
- failed queued items keep their error state locally and retry with backoff when
  the app is open and connected.

Still missing:

- Android APK sign-in/sync smoke testing with a registered OAuth SHA-1.
- OS-level native background sync while the app is closed.
