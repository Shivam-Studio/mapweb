@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title MapMotion Studio - Safe GitHub Publisher

set "EXPECTED_HTTPS=https://github.com/Shivam-Studio/mapweb.git"
set "EXPECTED_HTTPS_NOGIT=https://github.com/Shivam-Studio/mapweb"
set "EXPECTED_SSH=git@github.com:Shivam-Studio/mapweb.git"
set "ORIGIN_URL="

echo ==============================================================
echo   MAPMOTION STUDIO 0.8.1 - SAFE GITHUB PUSH
echo   Target: Shivam-Studio/mapweb
echo ==============================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git for Windows is not installed or not on PATH.
  echo Install it from https://git-scm.com/download/win
  pause
  exit /b 1
)

if not exist ".git" (
  echo Initializing Git in this extracted project folder...
  git init
  if errorlevel 1 goto :failed
)

git branch -M main
if errorlevel 1 goto :failed

for /f "delims=" %%U in ('git remote get-url origin 2^>nul') do set "ORIGIN_URL=%%U"
if not defined ORIGIN_URL (
  echo Adding the expected GitHub remote...
  git remote add origin "%EXPECTED_HTTPS%"
  if errorlevel 1 goto :failed
) else (
  if /I not "%ORIGIN_URL%"=="%EXPECTED_HTTPS%" if /I not "%ORIGIN_URL%"=="%EXPECTED_HTTPS_NOGIT%" if /I not "%ORIGIN_URL%"=="%EXPECTED_SSH%" (
    echo ERROR: This folder is already connected to a different GitHub repository:
    echo   %ORIGIN_URL%
    echo.
    echo No remote was changed and nothing was pushed.
    echo Check the repository before changing origin manually.
    pause
    exit /b 2
  )
)

for /f "delims=" %%N in ('git config user.name 2^>nul') do set "GIT_NAME=%%N"
for /f "delims=" %%E in ('git config user.email 2^>nul') do set "GIT_EMAIL=%%E"
if not defined GIT_NAME (
  set /p "GIT_NAME=Git commit name [Shivam-Studio]: "
  if not defined GIT_NAME set "GIT_NAME=Shivam-Studio"
  git config user.name "!GIT_NAME!"
)
if not defined GIT_EMAIL (
  echo Enter the email you want recorded on Git commits.
  set /p "GIT_EMAIL=Git commit email: "
  if not defined GIT_EMAIL (
    echo ERROR: A commit email is required. Nothing was pushed.
    pause
    exit /b 3
  )
  git config user.email "!GIT_EMAIL!"
)

echo.
echo Staging project files (ignored secrets, databases and local environments stay excluded)...
git add -A
if errorlevel 1 goto :failed
git status --short

git diff --cached --quiet
if errorlevel 1 (
  echo.
  echo Creating update commit...
  git commit -m "MapMotion Studio 0.8.1 - Vercel deployment setup"
  if errorlevel 1 goto :failed
) else (
  echo.
  echo No new staged changes. The current commit will be synchronized.
)

rem Create a local recovery branch before reconciling with the remote main branch.
git rev-parse --verify HEAD >nul 2>nul
if not errorlevel 1 (
  for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%T"
  if defined STAMP git branch "backup/pre-vercel-sync-!STAMP!" HEAD >nul 2>nul
)

echo.
echo Fetching the existing GitHub main branch...
git fetch origin
if errorlevel 1 goto :failed

git show-ref --verify --quiet refs/remotes/origin/main
if errorlevel 1 goto :push

git merge-base HEAD origin/main >nul 2>nul
if errorlevel 1 (
  echo Existing GitHub history is unrelated. Merging without force-pushing...
  git merge origin/main --allow-unrelated-histories -X ours --no-edit
) else (
  echo Synchronizing local and remote main branches without force-pushing...
  git merge origin/main -X ours --no-edit
)
if errorlevel 1 (
  echo.
  echo ERROR: Git could not merge automatically.
  echo No force-push was attempted. Resolve the merge, then run this file again.
  pause
  exit /b 4
)

:push
echo.
echo Pushing main to GitHub. Complete browser sign-in if Git Credential Manager asks...
git push -u origin main
if errorlevel 1 goto :failed

echo.
echo ==============================================================
echo SUCCESS: source pushed to https://github.com/Shivam-Studio/mapweb
echo ==============================================================
echo.
echo VERCEL REMINDER:
echo In Vercel Settings -^> Git, connect Shivam-Studio/mapweb.
echo Do not leave the project connected to stephinhenry91-design/mapweb.
echo Set the Vercel Root Directory to the repository root (./).
echo.
pause
exit /b 0

:failed
echo.
echo PUSH NOT COMPLETED. Read the Git error above.
echo This script never uses git push --force.
echo Confirm GitHub sign-in and write access to Shivam-Studio/mapweb.
pause
exit /b 1
