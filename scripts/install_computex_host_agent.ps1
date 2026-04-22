$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExe = Join-Path $scriptDir "ComputeXHostAgent.exe"
$sourceUninstall = Join-Path $scriptDir "uninstall_computex_host_agent.ps1"

if (-not (Test-Path $sourceExe)) {
    throw "ComputeXHostAgent.exe not found next to this installer script."
}

$installRoot = Join-Path $env:LOCALAPPDATA "Programs\\ComputeXHostAgent"
$targetExe = Join-Path $installRoot "ComputeXHostAgent.exe"
$targetUninstall = Join-Path $installRoot "uninstall_computex_host_agent.ps1"

New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item $sourceExe $targetExe -Force
if (Test-Path $sourceUninstall) {
    Copy-Item $sourceUninstall $targetUninstall -Force
}

$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "ComputeX Host Agent.lnk"
$startMenuDir = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\ComputeX"
$startMenuShortcut = Join-Path $startMenuDir "ComputeX Host Agent.lnk"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetExe
$shortcut.WorkingDirectory = $installRoot
$shortcut.IconLocation = "$targetExe,0"
$shortcut.Save()

New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null
$menuLink = $shell.CreateShortcut($startMenuShortcut)
$menuLink.TargetPath = $targetExe
$menuLink.WorkingDirectory = $installRoot
$menuLink.IconLocation = "$targetExe,0"
$menuLink.Save()

$uninstallKey = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ComputeXHostAgent"
$protocolKey = "HKCU:\\Software\\Classes\\computexhost"
$protocolCommandKey = Join-Path $protocolKey "shell\\open\\command"
New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name "DisplayName" -Value "ComputeX Host Agent"
Set-ItemProperty -Path $uninstallKey -Name "Publisher" -Value "ComputeX"
Set-ItemProperty -Path $uninstallKey -Name "DisplayVersion" -Value "1.0.0"
Set-ItemProperty -Path $uninstallKey -Name "InstallLocation" -Value $installRoot
Set-ItemProperty -Path $uninstallKey -Name "DisplayIcon" -Value $targetExe
Set-ItemProperty -Path $uninstallKey -Name "NoModify" -Type DWord -Value 1
Set-ItemProperty -Path $uninstallKey -Name "NoRepair" -Type DWord -Value 1
if (Test-Path $targetUninstall) {
    Set-ItemProperty -Path $uninstallKey -Name "UninstallString" -Value "powershell.exe -ExecutionPolicy Bypass -File `"$targetUninstall`""
}

New-Item -Path $protocolCommandKey -Force | Out-Null
Set-Item -Path $protocolKey -Value "URL:ComputeX Host Agent Protocol"
Set-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value ""
Set-Item -Path $protocolCommandKey -Value "`"$targetExe`" `"%1`""

Write-Host "ComputeX Host Agent installed to: $installRoot"
Write-Host "Desktop shortcut created: $shortcutPath"
Write-Host "Start Menu shortcut created: $startMenuShortcut"
Write-Host "Apps & Features entry registered: ComputeX Host Agent"
Write-Host "Custom URL protocol registered: computexhost://"
