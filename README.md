# MapMotion Studio 0.8.9 — Global Position AutoPlacer

MapMotion Studio is a browser-based SVG map editor for map-animation creators. It provides country/region selection, world and continent camera framing, map styling, optional physical-terrain SVG layers when supplied by a map, manual raster pairing, saved projects, three animator-focused export actions, and the Global Position AutoPlacer for India state overlays.

This release improves GitHub Git LFS upload authentication recovery and includes a secure Windows upload-key setup helper. User-uploaded map assets remain stored durably in GitHub Git LFS. The browser transfers large SVG/raster bytes directly to GitHub LFS; Vercel receives only small upload-authorization and Git metadata requests. Saved project records still use SQLite and remain temporary on Vercel.

## Quick start — Windows local app

1. Install Python 3.10+ and enable **Add Python to PATH**.
2. Double-click `run_windows.bat`.
3. Open <http://127.0.0.1:8000> if the browser does not open automatically.
4. Choose one of the ten included starter maps in **Map Library**, or upload an SVG boundary file you own or are licensed to use.
5. Open the map in the editor and use its default world/continent camera.

The launcher creates `.venv`, installs `backend/requirements.txt`, and starts FastAPI on port 8000. On Windows, the SQLite database remains under `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`; uploaded map assets remain in `storage/maps/`.

## Global Position AutoPlacer

The **Global Position AutoPlacer** exports an India state / Union Territory as a transparent PNG on the exact pixel frame used by a selected world or regional crop. It uses geoBoundaries India ADM1 geometry and supports:

- **Known geographic crops**: world, Asia, South Asia, India, India + neighbours, or custom west/south/east/north bounds.
- **Projection selection**: WGS84 Web Mercator (EPSG:3857) or equirectangular longitude/latitude (EPSG:4326).
- **Unknown third-party crops**: three-point affine calibration. Enter three geographic locations, click each matching point on the uploaded reference image, and MapMotion records its original image pixel coordinates automatically; manual X/Y entry remains available.
- **Reference-image preview**: optionally load the exact crop image and match the output width/height to it.
- **Position package**: a transparent full-canvas state PNG plus `placement.json` and Alight Motion import instructions.

**Alignment rule:** geographic presets are extents, not image recognition. They align only when the base image has the same projection and exact geographic bounds. If a third-party crop has unknown margins, projection, or extent, calibrate it first. Three-point affine registration is a local approximation and is not a replacement for reprojection on large or highly curved maps. Existing bundled SVG map assets that do not declare a verified geographic reference system are not silently assumed to be EPSG:3857.

The app fetches the pinned geoBoundaries India ADM1 dataset through a same-origin FastAPI endpoint, validates all 36 state / UT polygon geometries, caches the response for one day, and falls back to the Git LFS media URL if needed. A raw GitHub LFS pointer is explicitly rejected so it cannot silently break the state selector. The source metadata reports a represented boundary year of 2011 and a CC BY 2.5 India licence. Attribute geoBoundaries and its source contributors; see [`AUTO_PLACER_GUIDE.md`](AUTO_PLACER_GUIDE.md).

## The three animator exports

1. **Camera Map SVG** — exports the visible camera frame (world/continent/custom view, current pan/zoom and map style), retains any applied country fill colours, and removes all country-boundary outline strokes and selection glow.
2. **Country PNG** — exports one selected country in its applied fill colour as a tightly cropped transparent PNG. If no custom colour is applied in Physical mode, its relief texture is used.
3. **Country + exact map position** — downloads a ZIP containing a full-camera JPEG with the selected colour visible, a transparent full-camera-frame PNG of the selected country at its exact position, `placement.json`, and import instructions. The JPEG and PNG share identical pixel dimensions and camera viewBox. JPEG is flattened/opaque; use the PNG as the independent compositor layer.

Export the camera map and positioned country from the same source map and unchanged camera session. The position metadata guarantees alignment in the matching SVG frame; it does not claim accurate latitude/longitude unless the input SVG is independently georeferenced.

## Push to GitHub

1. Extract this ZIP into your MapMotion Studio project folder.
2. Install Git for Windows: <https://git-scm.com/download/win>.
3. Double-click `PUSH_TO_GITHUB.bat`.
4. Enter your Git commit email if asked and complete Git Credential Manager sign-in.

The BAT targets <https://github.com/Shivam-Studio/mapweb>. It sets the expected `origin`, creates a local recovery branch before remote synchronization, fetches/merges the existing `main` branch and never force-pushes. Uploaded map binaries are stored by GitHub Git LFS; the Git repository contains small pointer files, the catalog and metadata. See [`PUSH_TO_GITHUB.md`](PUSH_TO_GITHUB.md).

## Deploy to Vercel

Read [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) before importing the repository.

The Vercel entrypoint is configured in the root `pyproject.toml`:

```toml
[tool.vercel]
entrypoint = "app:app"
```

The root `requirements.txt` lists the runtime dependencies. `.python-version` selects Python 3.12. Set the Vercel Root Directory to the repository root (`./`).

**Current Vercel project:** `mapweb-p412` is the FastAPI deployment imported from `Shivam-Studio/mapweb`. Keep Root Directory at `./` and verify the source commit after each push.

## Durable map uploads with GitHub Git LFS

Vercel Functions reject request bodies larger than 4.5 MB. MapMotion Studio avoids that limit: the browser hashes the selected files, asks the FastAPI endpoint for a Git LFS upload action, and then transfers the file bytes directly to GitHub's LFS upload URL. Vercel does not receive the large file body. After upload, the API commits only LFS pointer files, `metadata.json`, and `storage/maps/user-uploads/catalog.json` to the configured Git branch.

### Required environment variables

Add these to **Vercel → Project → Settings → Environment Variables** for Production (and Preview if you use it), then redeploy:

| Variable | Value |
|---|---|
| `MAPMOTION_GITHUB_OWNER` | `Shivam-Studio` (repository owner / organization) |
| `MAPMOTION_GITHUB_USERNAME` | Your personal GitHub username used for Git LFS Basic authentication |
| `MAPMOTION_GITHUB_REPO` | `mapweb` |
| `MAPMOTION_GITHUB_BRANCH` | `main` |
| `MAPMOTION_GITHUB_TOKEN` | Fine-grained GitHub token with **Contents: Read and write** for this repository |
| `MAPMOTION_UPLOAD_KEY` | A long random secret used when the administrator uploads or updates map assets |
| `MAPMOTION_MAX_LFS_FILE_MB` | Optional. Default `2000` MB (conservative below Free/Pro max); use `4000` for Team or `5000` for Enterprise Cloud |

Keep the GitHub token and upload key server-side in Vercel Environment Variables. Never put either secret in `frontend/app.js`, HTML, or a committed `.env` file. The administrator enters the upload key in the browser when starting an upload; it remains in page memory only. Run `SET_UPLOAD_KEY.bat` on Windows to generate and copy a fresh key and save it directly to Vercel without exposing it in chat or source control.

The repository must contain `.gitattributes` with the rule for `storage/maps/user-uploads/**`. This ZIP includes that file. Push this release to `Shivam-Studio/mapweb` before enabling the Vercel variables.

### GitHub LFS limits — not unlimited storage

Git LFS bypasses Git's normal large-file blob limit, but it is not unlimited. GitHub's current per-file LFS maximum is 2 GB on Free/Pro, 4 GB on Team, and 5 GB on Enterprise Cloud. Default app configuration is 2 GB per file. Free and Pro accounts include 10 GiB storage and 10 GiB monthly download bandwidth; Team and Enterprise Cloud include 250 GiB of each. Additional usage may be billed, or LFS can be blocked after the quota is exhausted if overages are disabled. Check the GitHub plan and LFS budget before uploading very large map libraries.

Large downloads from the map library use Git LFS bandwidth. Projects are **not** stored in Git in this release: saved project data still lives in Vercel's temporary SQLite directory and can disappear on restarts or across function instances.

See [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) for setup and validation details.

## Map assets and licences

This release includes ten starter maps: World Map — India View, World Satellite Map — India View, World Physical Map — India View, and Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours regional maps. The new World Satellite map preserves the supplied 2048×2048 SVG with its embedded satellite raster and 257 editable boundaries; its separate Physical style uses the supplied 2048×2048 PNG on the same canvas. These user-supplied assets have no redistribution license or projection declaration recorded, so verify your rights before publishing the public repository. The other country-boundary assets based on amCharts retain the visible credit and CC BY 4.0 attribution. See [`storage/maps/ATTRIBUTION.md`](storage/maps/ATTRIBUTION.md). The other physical-relief starter textures are illustrative, not measured elevation datasets. A visual contact sheet is included as [`STARTER_MAPS_PREVIEW.jpg`](STARTER_MAPS_PREVIEW.jpg).

Uploaded map assets on Vercel use GitHub Git LFS when the required server-side environment variables are configured. They are not written into the Vercel filesystem. Git LFS per-file limits and account quotas apply. Saved projects are still temporary on Vercel; see [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md).

## Validation commands

Install QA dependencies, then run:

```bash
python -m pip install -r requirements-dev.txt
node --check frontend/app.js
python -m py_compile app.py backend/app.py backend/github_storage.py
node QA_GITHUB_LFS_TEST.js
node QA_CAMERA_TEST.js
node QA_AUTOPLACER_TEST.js
python qa_vercel_smoke.py
python qa_github_lfs.py
```

The QA smoke tests check all ten bundled maps, frontend assets, local camera/export behaviour, Vercel upload blocking when Git LFS is not configured, and mocked Git LFS upload/catalog flows. They do not prove that the connected GitHub token, repository permissions, real LFS upload URLs, or production Vercel deployment are configured correctly.

## Licence

No application licence has been added. Choose an appropriate licence before inviting public contributions or reuse.


## 0.8.3 export changes

- Applied country colours remain visible when selected and refresh all map/export previews.
- Camera Map SVG keeps the camera view and applied fills but removes boundary strokes and selection glow.
- Country PNG and positioned-country exports prioritise an applied fill over physical relief.
- Positioned-country ZIP includes a flattened full-camera JPEG plus a transparent exact-position PNG and `placement.json`.
- Run `node QA_EXPORT_COLOUR_TEST.js` for the export-colour regression check.
