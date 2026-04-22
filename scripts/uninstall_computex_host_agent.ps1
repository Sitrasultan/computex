$ErrorActionPreference = "Stop"

$installRoot = Join-Path $env:LOCALAPPDATA "Programs\\ComputeXHostAgent"
$desktop = [Environment]::GetFolderPath("Desktop")
$desktopShortcut = Join-Path $desktop "ComputeX Host Agent.lnk"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\ComputeX"
$startMenuShortcut = Join-Path $startMenuDir "ComputeX Host Agent.lnk"
$uninstallKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ComputeXHostAgent"
$protocolKey = "HKCU:\\Software\\Classes\\computexhost"

Remove-Item -Force -ErrorAction SilentlyContinue $desktopShortcut
Remove-Item -Force -ErrorAction SilentlyContinue $startMenuShortcut
Remove-Item -Force -ErrorAction SilentlyContinue $uninstallKey
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $protocolKey

if (Test-Path $installRoot) {
    Remove-Item -Recurse -Force $installRoot
}

if (Test-Path $startMenuDir) {
    $remaining = Get-ChildItem -Force $startMenuDir -ErrorAction SilentlyContinue
    if (-not $remaining) {
        Remove-Item -Force $startMenuDir -ErrorAction SilentlyContinue
    }
}

Write-Host "ComputeX Host Agent has been uninstalled."
