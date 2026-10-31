# Push MapMotion Studio 0.8.1 to GitHub

## One-click Windows method

1. Extract the ZIP into a dedicated folder, for example `C:\Users\Creat\Documents\MapMotionStudio`.
2. Install Git for Windows if needed: <https://git-scm.com/download/win>.
3. Double-click `PUSH_TO_GITHUB.bat`.
4. Enter your Git commit email if Git asks for it.
5. Complete Git Credential Manager sign-in in the browser.
6. Wait for the script to print `SUCCESS`.

The script targets **https://github.com/Shivam-Studio/mapweb**. It refuses to overwrite a different `origin`, creates a local recovery branch before synchronizing, fetches and merges an existing remote `main`, and never force-pushes.

If automatic merge cannot complete, the script stops safely. It does not delete remote files or overwrite a different remote.

## If updating an existing local clone

Extract this ZIP over the existing project folder (do not delete `.git`), then double-click `PUSH_TO_GITHUB.bat`. It will stage the updated source and reconcile with the remote branch.

## Important Vercel repository check

The Vercel deployment details previously supplied showed the source repository as `stephinhenry91-design/mapweb`. The verified MapMotion Studio code repository is `Shivam-Studio/mapweb`. In Vercel, open **Project Settings → Git** and connect the latter repository, or pushes to `Shivam-Studio/mapweb` will not trigger this Vercel project.
