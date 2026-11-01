# Push MapMotion Studio 0.8.2 to GitHub

## Existing Windows clone (recommended)

1. Extract this ZIP over `C:\Users\Creat\OneDrive\Documents\MapMotionStudio`.
2. Keep the existing `.git` folder. Do not delete your local database or projects.
3. Open PowerShell in the project folder.
4. Run `cmd /c PUSH_TO_GITHUB.bat` (or double-click the BAT in File Explorer).
5. Complete Git Credential Manager sign-in if prompted.

The script targets `https://github.com/Shivam-Studio/mapweb.git`. It creates a recovery branch, repairs the known interrupted-merge marker if present, fetches `origin/main`, merges without force-pushing, and stops safely on other conflicts.

The `.gitignore` file intentionally tracks only the nine curated starter-map folders. It continues to ignore user-upload folders, private map data, databases, secrets, `.venv`, and local project data. The included `vercel.json` explicitly includes `storage/maps/**` in the root FastAPI function bundle.

## After push

The Vercel project `mapweb-p412` should be connected to `Shivam-Studio/mapweb`, production branch `main`, Root Directory `./`, and FastAPI preset. A successful push to `main` should trigger a new Vercel deployment. Confirm the deployment's source commit matches GitHub `main`.

No force-push is used. If the script reports a merge conflict, run `git status` and keep the output for resolution.
