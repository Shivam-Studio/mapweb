# Push to `Shivam-Studio/mapweb`

1. Install Git for Windows: https://git-scm.com/download/win
2. Extract this source package into a dedicated `MapMotionStudio` folder.
3. Open that folder and double-click `PUSH_TO_MAPWEB.bat`.
4. Complete the Git Credential Manager sign-in in the browser when prompted.
5. The script initializes `main`, sets `origin` to `https://github.com/Shivam-Studio/mapweb.git` only when no origin exists, commits the source and pushes `main`.

The script refuses to overwrite a different existing `origin`.

## Public repository contents

This package intentionally omits development map data and satellite imagery because the source metadata does not establish redistribution rights for all of those assets. The `.gitignore` continues to exclude local map packs, SQLite databases, virtual environments and generated files. After the first push, upload an SVG you are licensed to use via Map Library → Upload map.

No application licence has been added; choose one before inviting public contributions or reuse.
