# Changelog

## 0.8.4 — GitHub Git LFS map storage

- Map uploads from Vercel use direct browser-to-GitHub Git LFS transfers; large file bytes do not pass through Vercel Functions.
- LFS pointer files, per-map metadata, and a Git-backed map catalog are committed under `storage/maps/user-uploads/`.
- Satellite-image uploads and alignment verification update the same Git-backed asset pair and metadata.
- Added server-side GitHub token configuration and a separate administrator upload key. No GitHub token is exposed to frontend code.
- Added configurable GitHub plan-aware per-file size limits and documented Git LFS storage/bandwidth quotas.
- Kept saved projects in temporary Vercel SQLite storage and labelled that limitation separately.
- Kept the 0.8.3 selection-colour, camera export and positioned-country export corrections.

## 0.8.3 — Selection colour and animator export corrections

- Applied country fill colours remain visible while a country is selected; selection styling no longer replaces the user fill with hard-coded orange.
- Applying colour refreshes the live map, camera preview, country preview and positioned-country preview.
- Applied fill colour takes priority over physical relief texture in Country PNG and positioned-country exports.
- Camera Map SVG preserves the active camera and applied fills while removing all geometry outline strokes and editor-only selection styling.
- Positioned Country ZIP includes a transparent full-camera country PNG, a flattened full-camera JPEG showing the applied country colour, placement.json and updated instructions.

## 0.8.2 — Bundled starter map library

- Added nine ready-to-use bundled starter maps: World Map — India View, World Physical Map — India View, Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours.
- Added cropped physical-relief textures for regional starter maps, including a dateline-wrapped Oceania view.
- Added visible map attribution and CC BY 4.0 licensing notes for amCharts boundary data.
- Added default camera views for each starter map.
- Kept satellite imagery out of the public bundle; physical relief is illustrative and not measured elevation data.

## 0.8.1 — Vercel deployment compatibility

- Added the explicit Vercel FastAPI entrypoint and root dependency manifest.
- Added a Python 3.12 runtime declaration for Vercel.
- Redirected SQLite to temporary storage rather than the read-only deployment bundle.
- Added an automated Vercel-mode API smoke test and a safe GitHub push script.
- Closed SQLite connections after each request to avoid leaking file handles in serverless instances.
