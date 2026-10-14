# Android Build Guide

This project targets Expo SDK 57 and React Native 0.86 for Android.

## Required Toolchain

- JDK: Android Studio bundled JBR 17
- Android SDK: compile/target SDK 36
- NDK: 27.1.12297006
- CMake/Ninja: prefer CMake 4.1.2 so Ninja is new enough for the native build
- Gradle: wrapper-managed

Use Android Studio's JDK for local builds:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
java -version
```

The expected Java major version is 17. Newer system JDKs can fail Android/React
Native native build tasks.

## Disk And Cache Setup

React Native New Architecture builds generate large native outputs. On Windows,
Gradle and Prefab default to user folders on `C:`, which can fail if `C:` is low
on free space even when the repo is on `D:`.

The project build script routes heavy cache/temp writes to `D:`:

```powershell
$env:GRADLE_USER_HOME='D:\gradle-cache'
$env:TEMP='D:\temp'
$env:TMP='D:\temp'
```

For universal APK builds, the script also prints available `C:` space and warns
when it is below 5 GiB. That check exists because some Android tools can still
touch user folders on `C:` even when Gradle cache and temp are redirected.

## Build Commands

Universal release APK:

```powershell
npm run build:android:apk
```

Faster local device APK, arm64 only:

```powershell
npm run build:android:apk -- arm64-v8a
```

Both scripts produce:

```txt
android\app\build\outputs\apk\release\app-release.apk
```

The local APK is debug-keystore signed by the generated Android project. It is
for direct install/testing, not Play Store production signing.

## Play Internal Testing Bundle

The internal-testing build must use the app's existing EAS upload keystore.
Keep the keystore and its passwords outside the repository, and set these
process environment variables before running `npm run build:android:aab`:

- `ANDROID_UPLOAD_STORE_FILE`
- `ANDROID_UPLOAD_STORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

The AAB build reads `config/staging.env` before Gradle bundles JavaScript.
Only the public Worker URL, Google Web client ID, and Play Integrity project
number belong there. Missing settings or a local URL stop the build. Use
`-CloudEnvironmentFile` when targeting another explicitly configured release
environment; do not put server secrets in this file.

The AAB is written to `android\app\build\outputs\bundle\release\app-release.aab`.
The build script refuses to create an AAB unless all signing variables are set.

Use the universal APK when you need an installable artifact that can run across
Android ABIs. Use the arm64-only APK for faster local testing on most modern
physical Android devices.

## Cleanup

If `C:` is low, inspect old Android and Gradle caches before a full build:

```powershell
Get-PSDrive -Name C,D
```

Common heavy folders are:

```txt
C:\Users\<user>\.gradle
C:\Users\<user>\AppData\Local\Temp
C:\Users\<user>\AppData\Local\Android
```

Do not delete active Gradle outputs while a build is running. Prefer closing
Android Studio and stopping Gradle first:

```powershell
cd android
.\gradlew.bat --stop
```

## Troubleshooting

### `There is not enough space on the disk`

Check `C:` free space first. Gradle may still use `C:\Users\<user>\.gradle` or
`%TEMP%` if the build script was not used.

Use:

```powershell
Get-PSDrive -Name C,D
```

### CMake Object Path Warnings

New Architecture codegen can produce long C++ paths, especially for generated
component code like Gesture Handler. The warning is not always fatal, but it
means the repo should stay in a reasonably short path.

Current expected root:

```txt
D:\Computer-Science\Projects\All\InfiniteCanvas
```

Avoid nesting another `InfiniteCanvas\` directory inside that root.

### Old CMake/Ninja Errors

If errors like `build.ninja still dirty` or failed generated directory creation
return, make sure CMake 4.1.2 is installed in the Android SDK and build with:

```powershell
$env:CMAKE_VERSION='4.1.2'
```
