# MapMotion Studio 0.8.1 — Vercel deployment-ready source

MapMotion Studio is a browser-based SVG map editor for map-animation creators. It provides country/region selection, world and continent camera framing, map styling, optional physical-terrain SVG layers when supplied by a map, manual raster pairing, saved projects, and three animator-focused export actions.

This release adds a Vercel FastAPI entrypoint and a temporary-storage compatibility mode. **It is not yet a durable multi-user cloud workspace** because persistent database and object-storage services have not been connected.

## Quick start — Windows local app

1. Install Python 3.10+ and enable **Add Python to PATH**.
2. Double-click `run_windows.bat`.
3. Open <http://127.0.0.1:8000> if the browser does not open automatically.
4. Open **Map Library → Upload map** and upload an SVG boundary file you own or are licensed to use.
5. Open the map in the editor and choose a world/continent camera.

The launcher creates `.venv`, installs `backend/requirements.txt`, and starts FastAPI on port 8000. On Windows, the SQLite database remains under `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`; uploaded map assets remain in `storage/maps/`.

## The three animator exports

1. **Camera Map SVG** — exports only the visible camera frame (world/continent/custom view, current pan/zoom and map style), without a selected-country highlight.
2. **Country PNG** — exports one selected country as a tightly cropped transparent PNG.
3. **Country + exact map position** — downloads a ZIP containing a full-camera-frame transparent PNG, `placement.json`, and import instructions. The positioned PNG uses the same pixel dimensions and camera viewBox as the Camera Map SVG, so it can be centered at 100% scale over the matching map.

Export the camera map and positioned country from the same source map and unchanged camera session. The position metadata guarantees alignment in the matching SVG frame; it does not claim accurate latitude/longitude unless the input SVG is independently georeferenced.

## Push to GitHub

1. Extract this ZIP into your MapMotion Studio project folder.
2. Install Git for Windows: <https://git-scm.com/download/win>.
3. Double-click `PUSH_TO_GITHUB.bat`.
4. Enter your Git commit email if asked and complete Git Credential Manager sign-in.

The BAT targets <https://github.com/Shivam-Studio/mapweb>. It refuses to replace a different `origin`, creates a local recovery branch before remote synchronization, fetches/merges the existing `main` branch and never force-pushes. See [`PUSH_TO_GITHUB.md`](PUSH_TO_GITHUB.md).

## Deploy to Vercel

Read [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) before importing the repository.

The Vercel entrypoint is configured in the root `pyproject.toml`:

```toml
[tool.vercel]
entrypoint = "backend.app:app"
```

The root `requirements.txt` lists the runtime dependencies. `.python-version` selects Python 3.12. Set the Vercel Root Directory to the repository root (`./`).

**Important repository check:** the previously shared Vercel deployment page showed `stephinhenry91-design/mapweb`, while the MapMotion Studio repository reviewed for this package is `Shivam-Studio/mapweb`. Connect the correct repository in Vercel → Project Settings → Git, otherwise this package's pushes will not trigger that deployment.

## Vercel storage limitation — preview mode only

Vercel's deployment bundle is read-only. In Vercel mode, this app routes SQLite and upload writes into `/tmp/MapMotionStudio` to avoid write failures. Vercel's `/tmp` is temporary; uploaded maps, satellite images and saved projects are **not guaranteed to survive restarts or be visible to other function instances**.

Before production use, integrate a persistent PostgreSQL database and object storage, configure their credentials as Vercel Environment Variables, and migrate the current SQLite schema and map asset workflow. Also enable Vercel Deployment Protection for previews; the MVP does not yet include user authentication or per-user data isolation. This ZIP does not create external accounts or pretend temporary storage is persistent. The app displays a temporary-storage warning when it detects Vercel mode.

## Map assets and licences

The public source package excludes bundled development map packs and satellite imagery because redistribution permission has not been confirmed for every asset. A fresh checkout/deployment therefore starts with an empty Map Library. Upload an SVG you own or are licensed to use. See [`ASSET_LICENSING.md`](ASSET_LICENSING.md) and [`storage/maps/README.md`](storage/maps/README.md).

On Vercel preview mode, uploaded assets use temporary storage. Do not treat those uploads as backups. Vercel Functions also enforce a 4.5 MB request/response body limit; this package conservatively limits hosted-preview uploads to 4 MB total per request. Larger SVG and raster files must go directly to object storage. See [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md).

## Validation commands

Install QA dependencies, then run:

```bash
python -m pip install -r requirements-dev.txt
node --check frontend/app.js
python -m py_compile backend/app.py
node QA_CAMERA_TEST.js
python qa_vercel_smoke.py
```

The QA smoke test runs the FastAPI app with `VERCEL=1` and checks home/static assets, health, SVG upload, asset download, satellite upload, pair verification, project create/list/delete, unsafe SVG rejection, and that writable data goes to the configured temporary directory. It does not prove durable cloud persistence or a successful remote Vercel deployment.

## Licence

No application licence has been added. Choose an appropriate licence before inviting public contributions or reuse.
