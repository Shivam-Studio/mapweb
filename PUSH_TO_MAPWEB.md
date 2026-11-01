# Push MapMotion Studio 0.8.6 to GitHub

1. Extract this package over the existing `MapMotionStudio` folder. Keep `.git` and your local `storage/projects` data.
2. Open PowerShell in the project root.
3. Run `git status` once to check for unrelated local edits.
4. Run `PUSH_TO_GITHUB.bat` (PowerShell alternative: `cmd /c PUSH_TO_GITHUB.bat`).
5. The BAT stages curated starter map packs because `.gitignore` explicitly allows all ten bundled map folders. It continues to ignore user uploads, databases, secrets and local environments.

The script creates a backup branch, fetches `origin/main`, merges without force-pushing, and stops on conflicts rather than overwriting either side.

Target: https://github.com/Shivam-Studio/mapweb
