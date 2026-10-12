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

## Run Web Dev Server

```powershell
npx expo start --port 8081
```

The expected status endpoint is:

```txt
http://localhost:8081/status
```

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

## Build Android APK

Use the scripted build so Gradle uses Android Studio's JDK 17 and writes heavy
cache/temp files to `D:`:

```powershell
npm run android:apk
```

For faster local iteration on modern Android devices:

```powershell
npm run android:apk:arm64
```

The APK path is:

```txt
android\app\build\outputs\apk\release\app-release.apk
```

See `docs/ANDROID_BUILD.md` for the full Android toolchain notes.
