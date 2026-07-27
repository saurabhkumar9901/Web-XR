# ============================================================
#  Solaya Quest — Push Videos to Meta Quest via ADB
# ============================================================
# Pushes video files from the local videos/ directory to the
# Quest's app-specific storage where the Solaya app expects them.
#
# Prerequisites:
#   - ADB installed and in PATH
#   - Quest 3 connected via USB or WiFi ADB
#   - Developer mode enabled on Quest 3
#
# Usage: .\push_videos.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$ProjectRoot\videos")) {
    $ProjectRoot = $PSScriptRoot
}

$VideosDir = Join-Path $ProjectRoot "videos"
$QuestPath = "/sdcard/Android/data/com.solaya.quest/files/vr_videos"

if (-not (Test-Path $VideosDir)) {
    Write-Host "[ERROR] Videos directory not found: $VideosDir" -ForegroundColor Red
    exit 1
}

# Check ADB
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
    Write-Host "[ERROR] ADB not found in PATH." -ForegroundColor Red
    Write-Host "Install Android SDK Platform Tools or add ADB to your PATH." -ForegroundColor Yellow
    exit 1
}

# Check device connection
$devices = (& adb devices 2>&1) -join "`n"
if ($devices -notmatch "(?m)device$") {
    Write-Host "[ERROR] No Quest device connected." -ForegroundColor Red
    Write-Host "Connect your Quest 3 via USB and enable USB debugging." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Steps:" -ForegroundColor Cyan
    Write-Host "  1. Enable Developer Mode in the Meta Quest app on your phone"
    Write-Host "  2. Connect Quest 3 to PC via USB"
    Write-Host "  3. Put on the headset and accept the USB debugging prompt"
    Write-Host "  4. Run this script again"
    exit 1
}

Write-Host ""
Write-Host "  Solaya Quest - Video Push" -ForegroundColor Cyan
Write-Host "  ========================" -ForegroundColor Cyan
Write-Host ""

$QuestPath = "/sdcard/Android/data/com.solaya.quest/files/vr_videos"

# Check if directory exists on Quest (app must be opened first)
Write-Host "  Checking if directory exists on Quest..." -ForegroundColor Yellow
$oldErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$dirCheck = & adb shell "ls -d `"$QuestPath`"" 2>&1
$ErrorActionPreference = $oldErrorAction

if ($dirCheck -match "No such file or directory") {
    Write-Host "[ERROR] Directory not found on Quest!" -ForegroundColor Red
    Write-Host "You MUST open the Solaya App on your Quest headset FIRST so it can securely create the folder." -ForegroundColor Yellow
    exit 1
}

# Get list of video files
$VideoFiles = Get-ChildItem -Path $VideosDir -File | Where-Object {
    $_.Extension -in @(".mp4", ".webm", ".mkv", ".mov")
}

if ($VideoFiles.Count -eq 0) {
    Write-Host "[WARNING] No video files found in $VideosDir" -ForegroundColor Yellow
    exit 0
}

Write-Host "  Found $($VideoFiles.Count) video files to push:" -ForegroundColor Green
Write-Host ""

$TotalSize = 0
$PushedCount = 0

foreach ($video in $VideoFiles) {
    $sizeMB = [math]::Round($video.Length / 1MB, 1)
    $sizeGB = [math]::Round($video.Length / 1GB, 2)
    $sizeStr = if ($sizeGB -ge 1) { "${sizeGB} GB" } else { "${sizeMB} MB" }
    
    Write-Host "  [$($PushedCount + 1)/$($VideoFiles.Count)] $($video.Name) ($sizeStr)" -ForegroundColor White -NoNewline
    
    # Check if file already exists on Quest with same size
    $oldErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $questFileInfo = & adb shell "ls -l `"$QuestPath/$($video.Name)`"" 2>&1
    $ErrorActionPreference = $oldErrorAction

    if ($questFileInfo -match $video.Length.ToString()) {
        Write-Host " - SKIP (already exists)" -ForegroundColor DarkGray
        $PushedCount++
        $TotalSize += $video.Length
        continue
    }
    
    Write-Host "" 
    & adb push "$($video.FullName)" "$QuestPath/$($video.Name)"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Done!" -ForegroundColor Green
        $PushedCount++
        $TotalSize += $video.Length
    } else {
        Write-Host "    FAILED!" -ForegroundColor Red
    }
}

$TotalGB = [math]::Round($TotalSize / 1GB, 2)
Write-Host ""
Write-Host "  Complete! Pushed $PushedCount/$($VideoFiles.Count) videos ($TotalGB GB)" -ForegroundColor Green
Write-Host "  Quest path: $QuestPath" -ForegroundColor Cyan
Write-Host ""

# Verify
Write-Host "  Verifying files on Quest:" -ForegroundColor Yellow
& adb shell "ls -lh `"$QuestPath`""
Write-Host ""
