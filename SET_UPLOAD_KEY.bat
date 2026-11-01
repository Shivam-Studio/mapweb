@echo off
setlocal
cd /d "%~dp0"
title MapMotion Studio - Secure Upload Key Setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SET_UPLOAD_KEY.ps1"
echo.
pause
