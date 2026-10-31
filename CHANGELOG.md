# Changelog

## 0.8.1 — Vercel deployment compatibility

- Added the explicit Vercel FastAPI entrypoint (`backend.app:app`) and root dependency manifest.
- Added a Python 3.12 runtime declaration for Vercel.
- Redirected Vercel SQLite and upload writes to temporary storage instead of the read-only deployment bundle.
- Added an in-app warning that Vercel temporary storage is not durable.
- Added automated Vercel-mode API smoke tests and a safe GitHub push script.
- Added a conservative 4 MB hosted-preview upload guard for Vercel Functions 4.5 MB request limits.
- Closed SQLite connections after each request to avoid leaking file handles in serverless instances.
- Documented temporary persistence, large-file and authentication limitations.
- Kept map packs excluded from public source until their redistribution rights are confirmed.


## 0.8.0 — Animator Export System
- Simplified export UI to exactly three primary actions: cropped Country PNG, positioned-country package, and map-only Camera SVG.
- Added full-camera-frame transparent country PNG exports that align exactly with matching Camera Map SVG exports.
- Added ZIP package containing positioned PNG, placement.json sidecar metadata, and import instructions.
- Sidecar records map identity/hash, source and camera viewBoxes, camera pan/zoom, output size, country bounds, visible pixel bounds, and normalized placement.
- Camera View SVG removes selection highlights and country isolation.
- Shared 4K/8K long-edge output setting keeps the Camera Map and positioned country canvas dimensions identical.
- Preserved the standalone tightly-cropped Country PNG workflow.

# Changelog

## 0.8.1 — Vercel deployment compatibility

- Added the explicit Vercel FastAPI entrypoint (`backend.app:app`) and root dependency manifest.
- Added a Python 3.12 runtime declaration for Vercel.
- Redirected Vercel SQLite and upload writes to temporary storage instead of the read-only deployment bundle.
- Added an in-app warning that Vercel temporary storage is not durable.
- Added automated Vercel-mode API smoke tests and a safe GitHub push script.
- Added a conservative 4 MB hosted-preview upload guard for Vercel Functions 4.5 MB request limits.
- Closed SQLite connections after each request to avoid leaking file handles in serverless instances.
- Documented temporary persistence, large-file and authentication limitations.
- Kept map packs excluded from public source until their redistribution rights are confirmed.


## 0.7.5 — Simplified export workflows

- Replaced the crowded export area with two workflows only: **Country PNG** and **Camera View SVG**.
- Country PNG now requires exactly one selected region and shows the same tightly cropped, transparent country-only result that is downloaded. The preview uses the same vector/physical compositing path as the PNG renderer.
- Removed the old full-map, satellite, generic selection and extra physical export buttons from the visible export interface.
- Added a camera-only preview with the active world/continent/custom viewBox, pan and zoom. It removes selected-country highlight and isolation dimming and includes no map content outside the camera frame.
- Camera SVG output includes explicit 4K/8K long-edge dimensions while retaining the editor camera aspect ratio.
- Added a manual CloudConvert handoff: download the SVG locally, then open the official SVG-to-PNG converter. No file is uploaded automatically.
- Saved country-export dimensions/transparency while preserving compatibility with previous project records.

## 0.7.3 — Current camera export correction

- Legacy 0.7.2 project files now infer whether a saved custom frame came from automatic country fit or intentional manual camera movement.

- Fixed the named-continent/auto-fit mismatch: selecting a country no longer silently replaces Asia/Europe/etc. by default. Auto-fit is now opt-in.
- Added explicit `Custom camera` indication after zoom-to-selection so the view dropdown cannot keep claiming that the map is still on a named continent while a custom selection frame is active.
- When switching to Current editor camera after an automatic fit, restores the named continent frame; intentional manual zoom and pan remain intact.
- Current-camera preview now shows subdued geographic context inside the captured camera frame, while the downloaded PNG remains a transparent single-country cutout.
- Replaced `getScreenCTM()` camera extraction with deterministic inverse camera math using the active SVG viewBox, canvas aspect, CSS zoom and pan.
- Added camera-matched 4K and maximum-safe-pixel output presets to avoid enormous letterboxing when the editor camera and output canvas have different aspect ratios.
- Camera help text now reports the captured view, zoom/pan and any output-aspect mismatch.


## 0.7.2 — Final audit polish

- Disabled the physical-terrain style and layer toggle on maps that do not include a physical SVG asset; invalid saved physical styles safely fall back to Political.
- Added a 512×512 PNG thumbnail for the ESRI world map and linked it from its metadata to avoid loading the full 9.5 MB vector SVG as a library preview.
- Cleaned the ESRI map display name and synchronized UI, backend, and cache versions to 0.7.2.

## 0.7.1 — Camera and continent correction

- Fixed camera-frame extraction for country PNG export.
- Fixed continent-boundary calculation so parent SVG transforms are included in all continent extents.
- Updated camera preview after pan, zoom and viewport resize.
- Added pointer-anchored zoom and an expanded camera zoom range.
- Prevented auto-fit from changing the frame during camera-mode country selection.
- Preserved source SVG clip-path definitions in isolated country exports.
- Excluded hidden SVG definition geometry from selectable regions.
- Expanded continent grouping coverage and added a raster-only Antarctica view when the SVG has no Antarctic vector polygon.
- Registered all bundled maps on fresh database creation; corrected API version reporting.

## 0.7.0 — Stability and export fixes

- Fixed zero-value country canvas placement.
- Preserved editor state while navigating between workspace pages.
- Fixed saved-project restore order and persisted selection, custom colors, layers, view, pan/zoom and country-export settings.
- Calculated selection/crop bounds in the root SVG coordinate frame, including nested group transforms.
- Made PNG export await browser rendering and PNG encoding and report actual failures.
- Added upload validation for external SVG style URLs and validated raster bytes before creating a map folder.
- Added thumbnail fallback to the uploaded SVG and guarded physical SVG downloads for maps without physical assets.
- Removed external Google Fonts loading so the interface works offline without network errors.
- Improved Windows launcher Python detection and startup error handling.


## 0.7.4 — 2026-10-31

- Physical terrain cutout now exports using the exact active editor camera and the same output dimensions as the country camera export. Embedded relief PNG is rasterized directly, then composited through a canvas geometry mask so SVG image clipping cannot silently drop the terrain.
- Physical export supports multiple selected regions and does not need to switch the visible editor style.
- Database moved to Windows Local AppData with one-time legacy migration; release archive excludes the live SQLite database. The old project-root database is copied with SQLite's online backup API and left untouched.
- Windows launcher refuses to start on an occupied port and explains how to stop the previous instance.
- Mobile navigation and editor workspace redesigned for narrow screens, including 320 px small phones and touch map interaction; checked all five workspace pages at 12 viewport widths and tested map drag/pan and bottom navigation at 390 px.


### V1 animator workflow sequence
- Reordered the three export actions to match the animator workflow: Camera Map SVG first, cropped Country PNG second, exact-position Country package third.
