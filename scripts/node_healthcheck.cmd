@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "EXIT_CODE=0"

python -V >nul 2>nul
if %ERRORLEVEL% EQU 0 goto use_python

py -3 "%SCRIPT_DIR%node_healthcheck.py" %*
goto after_run

:use_python
python "%SCRIPT_DIR%node_healthcheck.py" %*

:after_run
set "EXIT_CODE=%ERRORLEVEL%"

if %EXIT_CODE% NEQ 0 (
    echo.
    echo ComputeX Node healthcheck failed. Exit code: %EXIT_CODE%
)

exit /b %EXIT_CODE%
