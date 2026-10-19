param(
  [string]$Architectures = "",
  [string]$CloudEnvironmentFile = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$android = Join-Path $root "android"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$gradleHome = "D:\gradle-cache"
$tempRoot = "D:\temp"
$minCDriveFreeGbForUniversalBuild = 5

# Load the checked public release settings before Expo embeds the JavaScript.
# Existing terminal settings and .env.local must never silently remove the verifier.
if (-not $CloudEnvironmentFile.Trim()) {
  $CloudEnvironmentFile = Join-Path $root "config\staging.env"
}
$releaseConfig = & node (Join-Path $root "scripts\release-config.js") $CloudEnvironmentFile
if ($LASTEXITCODE -ne 0) { throw "Android release configuration is incomplete or unsafe." }
$publicEnvironment = $releaseConfig | ConvertFrom-Json
foreach ($property in $publicEnvironment.PSObject.Properties) {
  [Environment]::SetEnvironmentVariable($property.Name, $property.Value, "Process")
}

if (-not (Test-Path -LiteralPath $javaHome)) {
  throw "Android Studio JDK 17 was not found at $javaHome"
}

$cDrive = Get-PSDrive -Name C
$cDriveFreeGb = $cDrive.Free / 1GB
Write-Host ("C: free: {0:N2} GiB" -f $cDriveFreeGb)
if (-not $Architectures.Trim() -and $cDriveFreeGb -lt $minCDriveFreeGbForUniversalBuild) {
  $warningMessage = (
    "C: has less than {0} GiB free. The build script routes Gradle cache and temp to D:, " +
    "but Android tooling can still touch user folders on C:. Free space there if this build fails."
  ) -f $minCDriveFreeGbForUniversalBuild
  Write-Warning $warningMessage
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
  $args = @(":app:assembleRelease", "--no-daemon")
  if ($Architectures.Trim()) {
    $args += "-PreactNativeArchitectures=$Architectures"
  }

  & .\gradlew.bat @args
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path -LiteralPath $apk)) {
  throw "Release APK was not produced at $apk"
}

$item = Get-Item -LiteralPath $apk
Write-Host "APK: $($item.FullName)"
Write-Host ("Size: {0:N2} MiB" -f ($item.Length / 1MB))
