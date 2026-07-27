# ============================================================
#  Solaya Quest — Sync Client Files to APK Assets
# ============================================================
# Copies the web client files from client/ to the Android app's
# assets directory. Run this before building the APK in Android Studio.
#
# Usage: .\sync_client.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$ProjectRoot\client")) {
    $ProjectRoot = $PSScriptRoot
}

$SourceDir = Join-Path $ProjectRoot "client"
$TargetDir = Join-Path $ProjectRoot "quest-app\app\src\main\assets\client"

if (-not (Test-Path $SourceDir)) {
    Write-Host "[ERROR] Source directory not found: $SourceDir" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Solaya Quest - Client Sync" -ForegroundColor Cyan
Write-Host "  =========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Source: $SourceDir"
Write-Host "  Target: $TargetDir"
Write-Host ""

# Clean target directory (except .gitkeep)
if (Test-Path $TargetDir) {
    Write-Host "  Cleaning old assets..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TargetDir
}

# Create target directory
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

# Files and directories to copy
$ItemsToCopy = @(
    "index.html",
    "script.js",
    "vr-init.js",
    "vr-system.js",
    "environments.json",
    "stream-test.html",
    "assets"
)

$CopiedCount = 0
foreach ($item in $ItemsToCopy) {
    $sourcePath = Join-Path $SourceDir $item
    $targetPath = Join-Path $TargetDir $item

    if (Test-Path $sourcePath) {
        if ((Get-Item $sourcePath).PSIsContainer) {
            Copy-Item -Path $sourcePath -Destination $targetPath -Recurse -Force
            $fileCount = (Get-ChildItem -Path $targetPath -Recurse -File).Count
            Write-Host "  [DIR]  $item ($fileCount files)" -ForegroundColor Green
        } else {
            Copy-Item -Path $sourcePath -Destination $targetPath -Force
            Write-Host "  [FILE] $item" -ForegroundColor Green
        }
        $CopiedCount++
    } else {
        Write-Host "  [SKIP] $item (not found)" -ForegroundColor DarkGray
    }
}

# Remove .DS_Store files (macOS artifacts)
Get-ChildItem -Path $TargetDir -Recurse -Filter ".DS_Store" | Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Done! Synced $CopiedCount items." -ForegroundColor Green
Write-Host "  Now build the APK in Android Studio." -ForegroundColor Cyan
Write-Host ""
