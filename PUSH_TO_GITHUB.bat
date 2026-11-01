@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title MapMotion Studio - 0.8.5 Export Fix Push

set "REMOTE_URL=https://github.com/Shivam-Studio/mapweb.git"

echo ==============================================================
echo   MAPMOTION STUDIO 0.8.5 - SAFE EXPORT FIX PUSH
echo   Target: Shivam-Studio/mapweb ^(main^)
echo ==============================================================
echo.

if not exist ".git" (
  echo ERROR: .git folder not found.
  echo Extract this package into your existing MapMotionStudio Git folder.
  pause
  exit /b 1
)

for /f %%R in ('git remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"
if not defined CURRENT_REMOTE (
  echo ERROR: Git remote 'origin' is missing.
  pause
  exit /b 1
)

echo Remote: %CURRENT_REMOTE%
echo Updating origin to the intended repository...
git remote set-url origin "%REMOTE_URL%"
if errorlevel 1 goto :failed

rem Preserve the current local commit before any merge/abort operation.
git branch "backup/pre-vercel-fix-%RANDOM%"

rem Recover an interrupted merge without discarding ordinary working-tree edits.
if exist ".git\MERGE_HEAD" (
  echo An unfinished Git merge was detected. Aborting that incomplete merge...
  git merge --abort
  if errorlevel 1 (
    echo ERROR: Could not abort the unfinished merge safely.
    echo Run git status and send the output for manual recovery.
    pause
    exit /b 1
  )
)

rem Remove conflict markers left in the root requirements file by the earlier add/add merge.
findstr /c:"<<<<<<<" requirements.txt >nul 2>nul
if not errorlevel 1 (
  echo Repairing conflict markers in requirements.txt...
  >requirements.txt echo fastapi==0.115.12
  >>requirements.txt echo uvicorn[standard]==0.34.2
  >>requirements.txt echo python-multipart==0.0.20
)

for %%F in (app.py pyproject.toml requirements.txt backend\app.py frontend\index.html frontend\app.js frontend\styles.css) do (
  if not exist "%%F" (
    echo ERROR: Required file missing: %%F
    echo Make sure the ZIP was extracted into the project root.
    pause
    exit /b 1
  )
)

echo.
echo Staging updated source, export fixes and the nine bundled starter maps...
git add -A
if errorlevel 1 goto :failed

git diff --cached --quiet
if errorlevel 1 (
  echo Creating MapMotion Studio 0.8.5 Git LFS storage commit...
  git commit -m "Fix upload authentication retry and add secure key setup helper"
  if errorlevel 1 goto :failed
) else (
  echo No new local changes to commit.
)

echo.
echo Fetching latest GitHub main...
git fetch origin
if errorlevel 1 goto :failed

rem Fast-forward is preferred; merge remote commits if local and remote diverged.
git merge-base --is-ancestor origin/main HEAD
if errorlevel 1 (
  echo Synchronizing remote main before push...
  git merge --no-edit origin/main
  if errorlevel 1 goto :conflict
)

echo.
echo Pushing to GitHub...
git push -u origin main
if errorlevel 1 goto :failed

echo.
echo ==============================================================
echo   PUSH SUCCESSFUL
echo   Repository: https://github.com/Shivam-Studio/mapweb
echo ==============================================================
echo.
echo Vercel project: mapweb-p412 - Root Directory: ./ - Preset: FastAPI
echo The previously reviewed frontend-only Vercel project used a different repository.
echo.
pause
exit /b 0

:conflict
echo.
echo MERGE CONFLICT: Git stopped to protect both versions.
echo No force push was attempted.
echo Run: git status
echo Send that output so the remaining conflict can be resolved safely.
pause
exit /b 2

:failed
echo.
echo PUSH FAILED. No force push was attempted.
echo Run: git status
echo Send the complete output for diagnosis.
pause
exit /b 1
