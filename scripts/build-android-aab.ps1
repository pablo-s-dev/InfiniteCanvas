param(
  [string]$Architectures = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "android"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$gradleHome = "D:\gradle-cache"
$tempRoot = "D:\temp"

$requiredSigningVariables = @(
  "ANDROID_UPLOAD_STORE_FILE",
  "ANDROID_UPLOAD_STORE_PASSWORD",
  "ANDROID_UPLOAD_KEY_ALIAS",
  "ANDROID_UPLOAD_KEY_PASSWORD"
)
foreach ($variableName in $requiredSigningVariables) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variableName))) {
    throw "Set $variableName before building an Android App Bundle."
  }
}

if (-not (Test-Path -LiteralPath $env:ANDROID_UPLOAD_STORE_FILE -PathType Leaf)) {
  throw "ANDROID_UPLOAD_STORE_FILE does not point to a keystore file."
}
if (-not (Test-Path -LiteralPath $javaHome)) {
  throw "Android Studio JDK 17 was not found at $javaHome"
}

New-Item -ItemType Directory -Path $gradleHome, $tempRoot -Force | Out-Null

$env:JAVA_HOME = $javaHome
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
$env:CMAKE_VERSION = "4.1.2"
$env:NODE_ENV = "production"
$env:GRADLE_USER_HOME = $gradleHome
$env:TEMP = $tempRoot
$env:TMP = $tempRoot

Push-Location $android
try {
  $gradleArgs = @(":app:bundleRelease", "--no-daemon")
  if ($Architectures.Trim()) {
    $gradleArgs += "-PreactNativeArchitectures=$Architectures"
  }

  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$bundle = Join-Path $root "android\app\build\outputs\bundle\release\app-release.aab"
if (-not (Test-Path -LiteralPath $bundle -PathType Leaf)) {
  throw "Release AAB was not produced at $bundle"
}

$item = Get-Item -LiteralPath $bundle
Write-Host "AAB: $($item.FullName)"
Write-Host ("Size: {0:N2} MiB" -f ($item.Length / 1MB))
