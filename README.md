# MapMotion Studio 0.8.3 — Vercel deployment-ready source

MapMotion Studio is a browser-based SVG map editor for map-animation creators. It provides country/region selection, world and continent camera framing, map styling, optional physical-terrain SVG layers when supplied by a map, manual raster pairing, saved projects, and three animator-focused export actions.

This release adds nine bundled starter maps, a Vercel FastAPI entrypoint, and a temporary-storage compatibility mode. **It is not yet a durable multi-user cloud workspace** because persistent database and object-storage services have not been connected.

## Quick start — Windows local app

1. Install Python 3.10+ and enable **Add Python to PATH**.
2. Double-click `run_windows.bat`.
3. Open <http://127.0.0.1:8000> if the browser does not open automatically.
4. Choose one of the nine included starter maps in **Map Library**, or upload an SVG boundary file you own or are licensed to use.
5. Open the map in the editor and use its default world/continent camera.

The launcher creates `.venv`, installs `backend/requirements.txt`, and starts FastAPI on port 8000. On Windows, the SQLite database remains under `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`; uploaded map assets remain in `storage/maps/`.

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

The BAT targets <https://github.com/Shivam-Studio/mapweb>. It sets the expected `origin`, creates a local recovery branch before remote synchronization, fetches/merges the existing `main` branch and never force-pushes. Curated starter maps are explicitly allowed by `.gitignore`; private uploads, databases and local projects remain excluded. See [`PUSH_TO_GITHUB.md`](PUSH_TO_GITHUB.md).

## Deploy to Vercel

Read [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md) before importing the repository.

The Vercel entrypoint is configured in the root `pyproject.toml`:

```toml
[tool.vercel]
entrypoint = "app:app"
```

The root `requirements.txt` lists the runtime dependencies. `.python-version` selects Python 3.12. Set the Vercel Root Directory to the repository root (`./`).

**Current Vercel project:** `mapweb-p412` is the FastAPI deployment imported from `Shivam-Studio/mapweb`. Keep Root Directory at `./` and verify the source commit after each push.

## Vercel storage limitation — preview mode only

Vercel's deployment bundle is read-only. In Vercel mode, this app routes SQLite and upload writes into `/tmp/MapMotionStudio` to avoid write failures. Vercel's `/tmp` is temporary; uploaded maps, satellite images and saved projects are **not guaranteed to survive restarts or be visible to other function instances**.

Before production use, integrate a persistent PostgreSQL database and object storage, configure their credentials as Vercel Environment Variables, and migrate the current SQLite schema and map asset workflow. Also enable Vercel Deployment Protection for previews; the MVP does not yet include user authentication or per-user data isolation. This ZIP does not create external accounts or pretend temporary storage is persistent. The app displays a temporary-storage warning when it detects Vercel mode.

## Map assets and licences

This release includes nine starter maps: a World Map — India View, a dedicated World Physical Map — India View, and Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours regional maps. Country boundary geometry is based on the user-supplied amCharts world SVG and includes the visible credit plus CC BY 4.0 attribution. See [`storage/maps/ATTRIBUTION.md`](storage/maps/ATTRIBUTION.md). The physical relief layer is illustrative project-generated terrain, not a measured elevation dataset. No third-party satellite imagery is bundled. A visual contact sheet is included as [`STARTER_MAPS_PREVIEW.jpg`](STARTER_MAPS_PREVIEW.jpg).

On Vercel preview mode, uploaded assets use temporary storage. Do not treat those uploads as backups. Vercel Functions also enforce a 4.5 MB request/response body limit; this package conservatively limits hosted-preview uploads to 4 MB total per request. Larger SVG and raster files must go directly to object storage. See [`VERCEL_DEPLOYMENT.md`](VERCEL_DEPLOYMENT.md).

## Validation commands

Install QA dependencies, then run:

```bash
python -m pip install -r requirements-dev.txt
node --check frontend/app.js
python -m py_compile app.py backend/app.py
node QA_CAMERA_TEST.js
python qa_vercel_smoke.py
```

The QA smoke test runs the FastAPI app with `VERCEL=1` and checks all nine bundled map registrations and their SVG, physical, texture, and thumbnail routes; it also checks home/static assets, health, SVG upload, satellite upload, pair verification, project create/list/delete, unsafe SVG rejection, and that writable data goes to the configured temporary directory. It does not prove durable cloud persistence or a successful remote Vercel deployment.

## Licence

No application licence has been added. Choose an appropriate licence before inviting public contributions or reuse.


## 0.8.3 export changes

- Applied country colours remain visible when selected and refresh all map/export previews.
- Camera Map SVG keeps the camera view and applied fills but removes boundary strokes and selection glow.
- Country PNG and positioned-country exports prioritise an applied fill over physical relief.
- Positioned-country ZIP includes a flattened full-camera JPEG plus a transparent exact-position PNG and `placement.json`.
- Run `node QA_EXPORT_COLOUR_TEST.js` for the export-colour regression check.
