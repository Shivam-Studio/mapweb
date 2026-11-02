## 0.8.9 hotfix — AutoPlacer status badge synchronization

- Keep the AutoPlacer data badge in the loaded state whenever a state preview renders successfully.
- Prevent an older failed boundary-load request from overwriting a newer successful load status.
- Cache-bust the changed `frontend/app.js` asset so browsers fetch the hotfix.
- No change to the India state geometry, geographic registration, or PNG/ZIP export logic.

## 0.8.9 — India state selection and export repair

- Fixed India ADM1 loading: use a same-origin FastAPI boundary proxy backed by the Git LFS media endpoint; raw GitHub LFS pointer responses are rejected.
- Detect LFS pointer responses and invalid GeoJSON before populating the state list.
- Require all 36 state / Union Territory geometries before enabling preview and ZIP export.
- Added a retry control when boundary download fails.
- API validates all 36 polygon geometries and caches the dataset for one day.

# Changelog

## 0.8.8 — Interactive crop calibration

- Added click-to-record image pixel coordinates for the three-point AutoPlacer calibration workflow.
- Added incomplete-calibration state with reference-image preview, preventing premature export.
- Added explicit control-point selection and automatic advance to the next unplaced point.
- Separated South Asia and India-neighbours geographic crop presets.
- Retained the shared geographic coordinate frame and full-canvas transparent state overlay export.


## 0.8.8 — Global Position AutoPlacer

- Added a dedicated Global Position AutoPlacer workspace for India states and Union Territories.
- Added geographic crop presets for the World, Asia, South Asia, India, India + neighbours, and custom geographic bounds.
- Added WGS84 Web Mercator (EPSG:3857) and equirectangular (EPSG:4326) coordinate frames.
- Added three-point affine calibration for third-party cropped map images whose geographic extent is not already known.
- Added optional reference-image preview and exact canvas-dimension matching.
- Added transparent full-canvas state PNG export, `placement.json`, and Alight Motion import instructions in one ZIP.
- Uses a pinned geoBoundaries India ADM1 dataset at runtime; source metadata identifies CC BY 2.5 India and boundary year 2011. The guide documents attribution and the limits of affine registration.
- No changes to the existing map upload, GitHub LFS, camera export, or country export flows.

## 0.8.6 — Bundled India-view satellite and physical map

- Added a new built-in **World Satellite Map — India View** starter asset using the supplied corrected 2048×2048 SVG with its embedded satellite raster and 257 editable country/territory paths.
- Bundled the supplied 2048×2048 physical map PNG as a separate Physical style layer, embedded in `physical.svg` on the same 2048×2048 canvas.
- Preserved both supplied source images without changing their pixel dimensions or the SVG viewBox; added a matching thumbnail and map metadata.
- The map is part of the code repository and appears in Map Library after deployment; adding this built-in asset does not require the MapMotion upload key or the Git LFS upload form.
- Licensing/projection metadata is explicitly marked as user-supplied and unverified; confirm redistribution rights before publishing the repository.

## 0.8.5 — Upload authentication recovery

- Upload-key prompt trims accidental leading/trailing whitespace.
- A rejected upload key (HTTP 403) clears the cached value and prompts once for the current key, instead of reusing the rejected value repeatedly.
- Satellite-upload and alignment-verification requests share the same authentication retry behaviour.
- Added a Windows helper to securely generate a new upload key, save it as a Vercel Secret, and verify the clipboard copy without printing the value.
- No credentials are embedded in frontend code or committed source files.

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
