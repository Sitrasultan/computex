param(
    [switch]$Clean,
    [switch]$SkipVenv
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$venvPath = Join-Path $projectRoot ".venv-build"
$requirementsPath = Join-Path $projectRoot "requirements-host-agent.txt"
$specPath = Join-Path $projectRoot "computex_host_agent.spec"
$releaseDir = Join-Path $projectRoot "release"
$portableDir = Join-Path $releaseDir "ComputeXHostAgent-portable"

if ($Clean) {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $projectRoot "build")
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $projectRoot "dist")
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $releaseDir
}

if ($SkipVenv) {
    $pythonExe = "python"
} else {
    if (-not (Test-Path $venvPath)) {
        py -3 -m venv $venvPath
    }
    $pythonExe = Join-Path $venvPath "Scripts\\python.exe"
}

& $pythonExe -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
& $pythonExe -m pip install -r $requirementsPath
if ($LASTEXITCODE -ne 0) { throw "dependency installation failed" }
& $pythonExe -m PyInstaller --noconfirm --clean $specPath
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
$distExe = Join-Path $projectRoot "dist\\ComputeXHostAgent.exe"
$portableExe = Join-Path $portableDir "ComputeXHostAgent.exe"
try {
    Copy-Item $distExe $portableExe -Force
} catch {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $fallbackExe = Join-Path $portableDir "ComputeXHostAgent-$timestamp.exe"
    Copy-Item $distExe $fallbackExe -Force
    Write-Host "Primary EXE was in use. Wrote fallback: $fallbackExe"
}
Copy-Item (Join-Path $projectRoot "assets\\computex.ico") $portableDir -Force
Copy-Item (Join-Path $projectRoot "scripts\\install_computex_host_agent.ps1") $portableDir -Force
Copy-Item (Join-Path $projectRoot "scripts\\uninstall_computex_host_agent.ps1") $portableDir -Force

Write-Host ""
Write-Host "Build complete."
Write-Host "Portable package: $portableDir"
Write-Host "Executable: $(Join-Path $portableDir "ComputeXHostAgent.exe")"
