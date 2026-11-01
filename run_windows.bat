@echo off
setlocal
cd /d "%~dp0"
title MapMotion Studio - Local Workspace

echo MapMotion Studio 0.8.5
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    set "PYTHON=py"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3.10 or newer was not found.
        echo Install Python from https://www.python.org/downloads/ and enable Add Python to PATH.
        pause
        exit /b 1
    )
    set "PYTHON=python"
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Creating the local Python environment...
    %PYTHON% -m venv .venv
    if errorlevel 1 goto :failed
)

echo [2/4] Installing or checking required packages...
call ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto :failed

echo [3/4] Checking whether port 8000 is available...
".venv\Scripts\python.exe" -c "import socket,sys;s=socket.socket();r=s.connect_ex(('127.0.0.1',8000));s.close();sys.exit(0 if r==0 else 1)"
if not errorlevel 1 goto :port_in_use

echo [4/4] Starting MapMotion Studio...
echo User projects and map records are stored in %%LOCALAPPDATA%%\MapMotionStudio.
echo Keep this terminal window open while using the app.
start "" http://127.0.0.1:8000
".venv\Scripts\python.exe" -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto :failed
exit /b 0

:port_in_use
echo.
echo Port 8000 is already in use. MapMotion Studio may still be running.
echo Close the older MapMotion Studio terminal with Ctrl+C, then run this file again.
echo Your saved database will not be overwritten by this release.
pause
exit /b 2

:failed
echo.
echo MapMotion Studio could not start. Read the error above.
pause
exit /b 1
