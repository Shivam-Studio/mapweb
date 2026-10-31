@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ================================================
echo   MapMotion Studio - GitHub V1 Publisher
echo ================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo ERROR: Git is not installed or not on PATH.
  echo Install Git for Windows: https://git-scm.com/download/win
  pause
  exit /b 1
)
where gh >nul 2>nul
if errorlevel 1 (
  echo ERROR: GitHub CLI is not installed or not on PATH.
  echo Install GitHub CLI: https://cli.github.com/
  pause
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not signed in.
  echo Starting GitHub login...
  gh auth login
  if errorlevel 1 goto :failed
)

rem Set a local commit identity from the authenticated GitHub account when missing.
for /f "usebackq delims=" %%i in (`gh api user --jq .login`) do set "GH_LOGIN=%%i"
for /f "usebackq delims=" %%i in (`gh api user --jq .id`) do set "GH_ID=%%i"
if not defined GH_LOGIN goto :failed
for /f "usebackq delims=" %%i in (`git config user.name`) do set "GIT_NAME=%%i"
if not defined GIT_NAME git config user.name "%GH_LOGIN%"
for /f "usebackq delims=" %%i in (`git config user.email`) do set "GIT_EMAIL=%%i"
if not defined GIT_EMAIL git config user.email "%GH_ID%+%GH_LOGIN%@users.noreply.github.com"

echo.
echo A NEW repository will be created under %GH_LOGIN%.
echo Private is the safe default. Public release needs map-asset redistribution rights.
echo.
set "REPO_NAME=MapMotion-Studio-V1"
set /p "REPO_NAME=New repository name [MapMotion-Studio-V1]: "
if not defined REPO_NAME set "REPO_NAME=MapMotion-Studio-V1"
set "VISIBILITY=private"
set /p "VISIBILITY=Visibility - private or public [private]: "
if not defined VISIBILITY set "VISIBILITY=private"
if /i not "%VISIBILITY%"=="private" if /i not "%VISIBILITY%"=="public" (
  echo ERROR: Enter private or public.
  pause
  exit /b 1
)

echo.
echo Checking release contents...
if exist "database.sqlite3" (
  echo ERROR: database.sqlite3 is present. Remove it before publishing.
  echo It can contain private project data.
  pause
  exit /b 1
)
if exist ".env" (
  echo ERROR: .env is present. Remove secrets before publishing.
  pause
  exit /b 1
)

if not exist ".git" git init -b main
if errorlevel 1 goto :failed

git add .
if errorlevel 1 goto :failed

git diff --cached --quiet
if not errorlevel 1 (
  echo No new changes to commit; checking the existing Git history.
) else (
  git commit -m "MapMotion Studio 0.8.0 - Animator Export System V1"
  if errorlevel 1 goto :failed
)

if exist ".git\config" (
  git remote get-url origin >nul 2>nul
  if not errorlevel 1 (
    echo ERROR: This folder already has an origin remote.
    echo Refusing to push to an existing repository automatically.
    echo Inspect it with: git remote -v
    pause
    exit /b 1
  )
)

echo.
echo Creating the new %VISIBILITY% GitHub repository and pushing main...
if /i "%VISIBILITY%"=="public" (
  gh repo create "%REPO_NAME%" --public --source . --remote origin --push
) else (
  gh repo create "%REPO_NAME%" --private --source . --remote origin --push
)
if errorlevel 1 goto :failed

echo.
echo SUCCESS. New repository created and main branch pushed.
gh repo view --web
pause
exit /b 0

:failed
echo.
echo PUBLISH FAILED. No success is assumed.
echo Review the error above, then retry after fixing it.
pause
exit /b 1
