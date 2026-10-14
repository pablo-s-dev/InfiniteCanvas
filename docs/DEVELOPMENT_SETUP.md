# Development Setup

This repo should live at:

```txt
D:\Computer-Science\Projects\All\InfiniteCanvas
```

Avoid nesting another `InfiniteCanvas\` directory inside that path. React Native
New Architecture codegen creates long native build paths on Windows, so shorter
repo roots reduce CMake/Ninja risk.

## Install

```powershell
npm install
```

## Run the app locally

```powershell
npm run worker:migrate:local
npm run dev:local
```

The migration command is needed on first setup and after local schema changes.
The local command keeps both Expo and the Worker running until you stop it.
The Worker uses port `47329`; Expo uses port `8081`.

Choose a target explicitly when you want the command to open it:

```powershell
npm run dev:local -- web
npm run dev:local -- android
npm run dev:local -- android build
```

The npm `--` separates npm options from the script's plain positional argument.
The Android target reuses an installed debuggable app and forwards the Expo and
Worker ports over Android Debug Bridge. Add `build` when the development app is
not installed or native code changed; an installed release app is never opened
as the development target. On a Mac with Xcode, `ios` can be used in the same
position as `android`.

To run the Worker without Expo, use `npm run worker:local`. It does not apply
database migrations automatically.

## Run the app with the remote staging Worker

Create the ignored `.env.cloud` file using the public app configuration shown
in [the Worker setup guide](../worker/README.md), then run:

```powershell
npm run dev:cloud
npm run dev:cloud -- web
npm run dev:cloud -- android
```

This mode starts only Expo. The web keeps calling `/api` on its local app origin;
Metro forwards that request to the HTTPS Worker URL from `.env.cloud`. Android
calls that same configured Worker URL directly. A missing or local cloud URL
stops startup instead of selecting the local Worker.

## Validate

```powershell
npm run verify
```

This runs:

- `tsc --noEmit`
- `vitest run`
- `npx expo-doctor`

Expo Doctor intentionally skips the app-config/native-folder sync warning
because this project keeps the regenerated `android/` folder in the repo.

## Build Android release APK

Use the scripted build so Gradle uses Android Studio's JDK 17 and writes heavy
cache/temp files to `D:`:

```powershell
npm run build:android:apk
```

For faster local iteration on modern Android devices:

```powershell
npm run build:android:apk -- arm64-v8a
```

The APK path is:

```txt
android\app\build\outputs\apk\release\app-release.apk
```

See `docs/ANDROID_BUILD.md` for the full Android toolchain notes.
