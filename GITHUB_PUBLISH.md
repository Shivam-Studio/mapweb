# Publish MapMotion Studio V1 to a new GitHub repository

The `publish_to_github.bat` script creates a **new** repository under the GitHub account authenticated in GitHub CLI and pushes the current `main` branch.

## Before publishing

- Keep the repository **private** unless you have confirmed redistribution rights for all bundled map, satellite and terrain assets.
- The release intentionally excludes the live SQLite database. Never commit a database copied from a working user installation.
- Do not add `.env`, access tokens, credentials or personal project data.
- Install [Git for Windows](https://git-scm.com/download/win) and [GitHub CLI](https://cli.github.com/).

## Publish

1. Extract the project ZIP.
2. Open the `MapMotionStudio` folder.
3. Double-click `publish_to_github.bat`.
4. Complete GitHub CLI sign-in when prompted.
5. Enter a new repository name (default: `MapMotion-Studio-V1`).
6. Keep visibility as `private` unless the asset licences have been cleared.

The script refuses to overwrite an existing `origin` remote and refuses to publish if a root `database.sqlite3` or `.env` file is present.

## Manual commands

```powershell
gh auth login
git init -b main
git add .
git commit -m "MapMotion Studio 0.8.0 - Animator Export System V1"
gh repo create MapMotion-Studio-V1 --private --source . --remote origin --push
```

To make it public later, first verify map and imagery redistribution permissions, then change `--private` to `--public` when creating the repository or change visibility through GitHub settings.
