# MapMotion Studio — MVP 0.8.0 (Animator Export System)

A local Windows-first map editor for editing SVG map geometry, camera framing and transparent country assets. Built with FastAPI, SQLite and a browser-based SVG editor.

## Start on Windows

This update ZIP intentionally excludes `database.sqlite3`. That prevents Windows Explorer from trying to overwrite a SQLite database while the running app has it open. On Windows, projects are stored at `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`. A legacy project-root database is migrated once with SQLite's online backup API; the old source file is left untouched.

Before updating an existing installation:

1. In the old MapMotion Studio terminal, press **Ctrl+C** and wait for the server to stop.
2. Keep your existing `MapMotionStudio` folder and its `storage` folder. Do not delete the legacy project-root `database.sqlite3` before migration.
3. Extract this ZIP into the **same `MapMotionStudio` folder**, allowing code and frontend files to update. The archive contains no live database file, so it cannot overwrite a locked SQLite database.
4. Start `run_windows.bat`. On first launch, the old project-root database is copied to `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`; the original is left in place until you confirm your projects are present.

For a fresh install, extract into a new folder. The database is created automatically and bundled maps are registered on first launch.

1. Install Python 3.10 or newer and enable **Add Python to PATH**.
2. Open the extracted `MapMotionStudio` folder.
3. Double-click `run_windows.bat`.
4. Open `http://127.0.0.1:8000` if the browser does not open automatically.
5. Keep the black terminal window open while using the app.

The launcher creates `.venv` once, installs pinned dependencies, and refuses to start if port 8000 is already occupied. Stop the older process with `Ctrl+C` before restarting.

## Publish V1 to GitHub

Run `publish_to_github.bat` to create a new GitHub repository and push the V1 source. The script defaults to a private repository and requires Git for Windows plus GitHub CLI. See [GITHUB_PUBLISH.md](GITHUB_PUBLISH.md) before publishing.

## Recommended workflow

1. Open **Map Library** and choose a bundled map or upload your SVG.
2. Open **Map Editor** and choose World, India or a continent camera.
3. Search/click a country; use Single or Multiple selection as needed.
4. Set the map style and layers, and pan/zoom the camera.
5. Use one of the three animator exports below.
6. Save the project before leaving the editor.

## The three export actions

The export panel follows the animator sequence: download the camera map base first, then a tight country cutout, then the country packaged at its exact camera position.

### 1. Country PNG

- Requires **exactly one selected country/region**.
- The preview and downloaded PNG show only that selected feature, tightly cropped to its actual vector bounds.
- Outside the feature is transparent by default; a solid background can be selected by turning off transparency.
- Uses the current map appearance: Political/Blank styling or the bundled physical relief when the Physical terrain style is active and available for the selected map.
- Supports preset or custom pixel dimensions up to 8192 px per side, subject to the browser's memory and maximum export-area safety limit.
- If zero or multiple regions are selected, the export is blocked with a clear message rather than exporting an unintended region.

### 2. Country + exact map position (ZIP package)

- Requires exactly one selected country/region.
- Downloads a ZIP containing a transparent `country-at-camera-position.png`, `placement.json`, and `IMPORT-INSTRUCTIONS.txt`.
- The PNG has the **same width, height and camera viewBox** as the Camera Map SVG export. It contains only the selected country, placed at its exact location in that camera frame; all other pixels remain transparent.
- The JSON sidecar records map ID/name and source SVG fingerprint, source map viewBox, camera viewBox, active world/continent/custom view, pan/zoom, output pixel dimensions, source-coordinate country bounds, visible pixel bounds, normalized coordinates, and an import placement recommendation.
- To align it, export the Camera Map SVG from the same source map and unchanged camera session, convert it to PNG if needed while preserving its width/height, then import the positioned PNG over it at canvas center, 100% scale, 0° rotation. Do not independently crop or resize either file.
- If the selected country is outside the current camera frame, the positioned export is blocked with a clear message. When a country is only partly visible, the package records the visible bounds and notes that it is clipped by the camera.

### 3. Camera Map SVG

- Exports only the map currently visible inside the editor camera: active world/continent/custom view, current pan and zoom, and current map style/layers.
- The map preview and export contain no selected-country highlight, no selection isolation dimming and no country-only cutout.
- The output's width and height are the same as the positioned-country PNG package generated from that camera state and shared output preset.
- The shared 4K/8K long-edge preset preserves the camera aspect ratio. For safe browser raster memory, the output may automatically scale down to remain within a 32-megapixel frame; the actual exported dimensions are shown in the editor. The Camera Map SVG remains vector.

### Convert Camera SVG to HD PNG with CloudConvert

The Camera Map card includes a text link to [CloudConvert SVG to PNG](https://cloudconvert.com/svg-to-png). Download the camera SVG first, open the converter, upload the file manually, choose PNG and preserve the SVG width/height. MapMotion Studio does not automatically upload the map to a third party; you control that upload. See the [CloudConvert SVG converter](https://cloudconvert.com/svg-converter) for its available output settings. 

## What is included

- Bundled ESRI world map with country/territory vector features, World Map — India View and World Physical Map — India View.
- SVG feature selection and search, Single/Multiple selection, zoom-to-selection, isolate selection, pointer-anchored zoom, panning and continent framing (North America, South America, Europe, Africa, Asia and Oceania). Antarctica is raster-only where the supplied SVG has no AQ vector boundary.
- Political, blank and physical display styles where the selected map provides the corresponding asset.
- Independent visibility controls for physical terrain and country boundaries.
- Optional manual satellite-image pairing with opacity, scale and X/Y alignment. Pair verification is a user confirmation, not an automatic GIS accuracy check.
- SQLite project save, reopen and delete. On Windows the database is stored in `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`.

## Important limitations

- The supplied India-view world SVG uses its own SVG coordinate frame and is **not georeferenced**. The editor can frame vector features, but it cannot derive trustworthy latitude/longitude bounds from this file.
- Satellite/raster alignment is manual. Confirming a pair records the user's verification; it does not prove geographic alignment.
- The bundled physical relief is procedurally generated illustrative shaded relief, not measured elevation data. It is not suitable for scientific terrain analysis.
- Uploaded maps must be SVG. Shapefile, GeoJSON, GeoTIFF and MBTiles are not currently ingested.
- Country/region selection depends on feature geometry and identifiers present in the uploaded SVG. Missing boundaries are not invented.
- 8K conversion through a third-party service is subject to that service's file limits, processing limits and account terms. CloudConvert upload is an explicit user action, not an automatic background transfer.
- This is a local single-user MVP, not a cloud or multi-user deployment.

## Validation status — 0.8.0

The following checks were performed against the actual frontend and bundled map assets in an isolated Chromium harness. API calls were mocked for the browser tests; the FastAPI backend was compiled and tested separately.

- `node --check frontend/app.js`: passed.
- `python -m py_compile backend/app.py`: passed.
- `QA_CAMERA_TEST.js`: passed.
- Country-only PNG: 3840 × 2160 test export created; non-empty alpha bounds verified.
- Positioned-country ZIP: ZIP CRC/integrity passed; contains positioned PNG, `placement.json` and import instructions. The PNG is 3840 × 3478 in the Asia test; the sidecar viewBox and output dimensions match the Camera Map SVG exactly.
- Pixel placement: actual PNG alpha bounds matched the sidecar's calculated visible camera-frame bounds within 2 pixels.
- Physical positioned country: tested with embedded relief texture; 10,668 distinct RGB colours in the country pixels confirmed visible terrain rather than outline-only output.
- Camera Map SVG: same 3840 × 3478 dimensions and same camera viewBox as positioned PNG; no country selection metadata/highlight in the SVG.
- 8K camera preset: vector SVG export created; for the portrait-like Asia test frame it auto-limited to 6087 × 5512 to stay within the 32 MP safe raster budget.
- Responsive checks at 320, 360, 375, 390, 430, 600, 760, 768, 850, 1024 and 1440 px: no document horizontal overflow; the three export buttons remained full-width.
- Browser console/page errors: none in the harness.

The browser harness used the app's actual HTML, CSS, JavaScript and map SVG/physical texture assets, with mocked API responses. The user's exact live Chrome tab and Windows environment were not controlled or tested from this session.

## Storage and backups

- Map assets and metadata: `storage/maps/<map-id>/` inside the project folder.
- Saved projects/map-library records: `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3` on Windows.
- Python virtual environment: `.venv/`.
- The legacy project-root database is not deleted automatically. Keep it until the migrated projects have been confirmed.

Back up both the `storage` folder and `%LOCALAPPDATA%\MapMotionStudio\database.sqlite3`.


## MVP 0.8.0 — Animator exports

The editor has exactly three export actions:

1. **Camera Map SVG** — download the current camera/continent view first. It contains map imagery and boundaries only, with country selection highlights and isolation states removed.
2. **Country PNG** — a tightly cropped transparent PNG of the selected country, for standalone use.
3. **Country + exact map position** — a ZIP containing a full-camera-frame transparent PNG, `placement.json`, and import instructions. The positioned PNG is the same pixel size and camera frame as the Camera Map export, so it can be centered at 100% scale over the matching map.

The Camera output size selector is shared by Camera Map SVG and positioned-country package exports. Export both from the same source map and camera session. The sidecar records source map ID/hash, viewBox, view preset, pan/zoom, output canvas size, source-coordinate country bounds, visible pixel bounds, and normalized pixel bounds.

The map source is not necessarily georeferenced. Placement metadata guarantees alignment in the matching SVG camera frame, not latitude/longitude accuracy.
