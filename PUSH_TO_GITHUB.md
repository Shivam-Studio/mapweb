# Push MapMotion Studio 0.8.6 to GitHub

## Existing Windows clone (recommended)

1. Extract this ZIP over `C:\Users\Creat\OneDrive\Documents\MapMotionStudio`.
2. Keep the existing `.git` folder. Do not delete your local database or projects.
3. Open PowerShell in the project folder.
4. Run `cmd /c PUSH_TO_GITHUB.bat` (or double-click the BAT in File Explorer).
5. Complete Git Credential Manager sign-in if prompted.

The script targets `https://github.com/Shivam-Studio/mapweb.git`. It creates a recovery branch, repairs the known interrupted-merge marker if present, fetches `origin/main`, merges without force-pushing, and stops safely on other conflicts.

All ten curated starter maps remain committed normally, including `storage/maps/world-satellite-india-view/`. The `.gitignore` whitelist in this ZIP explicitly includes that new folder so `git add -A` stages it. These built-in assets are normal Git files; Git LFS is reserved for later user uploads under `storage/maps/user-uploads/`. New user-uploaded maps are written by the deployed app as Git LFS objects under `storage/maps/user-uploads/`; their tiny pointer files, metadata and catalog are committed to `main`. `.gitattributes` tracks uploaded SVG, PNG, JPG and WebP binaries with Git LFS while keeping JSON metadata and the catalog in ordinary Git. Databases, secrets, `.venv`, and local project data remain excluded.

Before deploying, confirm that `.gitattributes` is committed and Git LFS is enabled for the GitHub repository. Configure the server-side Vercel variables listed in `VERCEL_DEPLOYMENT.md`.

## After push

The Vercel project `mapweb-p412` should be connected to `Shivam-Studio/mapweb`, production branch `main`, Root Directory `./`, and FastAPI preset. A successful push to `main` should trigger a new Vercel deployment. Confirm the deployment's source commit matches GitHub `main`.

No force-push is used. If the script reports a merge conflict, run `git status` and keep the output for resolution.
