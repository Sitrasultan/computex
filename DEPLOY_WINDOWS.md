# ComputeX Host Agent Windows Build

## Build the executable

From the project root:

```powershell
.\scripts\build_windows_exe.ps1 -Clean
```

or:

```cmd
.\scripts\build_windows_exe.cmd -Clean
```

The build output is created here:

- `release\ComputeXHostAgent-portable\ComputeXHostAgent.exe`

## Install on another PC

1. Copy the full folder `release\ComputeXHostAgent-portable` to the target PC.
2. On the target PC, run:

```powershell
.\install_computex_host_agent.ps1
```

This installs the app into `%LOCALAPPDATA%\Programs\ComputeXHostAgent`, creates Desktop + Start Menu shortcuts, registers **ComputeX Host Agent** under Apps & Features, and registers the custom protocol `computexhost://` for browser-to-app launch.

## Uninstall

From the install folder:

```powershell
%LOCALAPPDATA%\Programs\ComputeXHostAgent\uninstall_computex_host_agent.ps1
```

## Notes

- The app icon is embedded in the executable and window.
- Python dependencies are bundled by PyInstaller; target PCs do not need Python installed.
- Docker Desktop still needs to be installed/running on the target PC for ComputeX sessions.
