# MapMotion Studio 0.8.8 — QA report

## 0.8.8 bundled India-view map verification

- The repository now contains ten starter map folders; `world-satellite-india-view` is registered from the read-only deployment asset directory.
- The supplied corrected SVG is included byte-for-byte as `world-india.svg` (2048×2048 viewBox, 257 editable country/territory paths).
- The supplied physical PNG is included byte-for-byte as `physical-texture.png` (2048×2048 RGBA) and embedded as the Physical style `physical.svg` layer on the same 2048×2048 canvas.
- `.gitignore` explicitly unignores the new built-in map directory; the Windows push script stages all ten starter maps.
- The new map is bundled in the code release and does not require the upload-key / Git LFS user-upload workflow.
- Public redistribution rights for the two user-supplied source assets were not provided; confirm permission before pushing to the public repository.

## Storage changes verified

- Browser incremental SHA-256 hashing passes known test vectors.
- Vercel mode refuses legacy multipart map and satellite uploads rather than saving uploaded bytes to `/tmp`.
- Mocked Git LFS tests cover upload authorization, LFS pointer commits, map catalog listing, LFS download redirects, satellite overrides for bundled starter maps, and committed pairing metadata.
- GitHub token and upload key are server-only configuration; the browser uses the short-lived upload action and a separate administrator key.
- Saved project records remain temporary Vercel SQLite data; this has not been migrated to Git.

# MapMotion Studio 0.8.3 — QA report

## Automated checks

- `node --check frontend/app.js` — passed.
- `node QA_CAMERA_TEST.js` — passed (camera viewBox, zoom, pan and portrait framing regression).
- `node QA_EXPORT_COLOUR_TEST.js` — passed (custom fill priority, physical-relief fallback, outline-free camera export, JPEG + transparent PNG package and preview-refresh wiring).
- `python -m py_compile app.py backend/app.py qa_vercel_smoke.py` — passed.
- `python qa_vercel_smoke.py` — passed (Vercel-mode FastAPI, frontend assets, health, all ten bundled maps and their asset routes, upload/pair/project API workflow and SVG safety checks).

## Browser integration checks

A local headless Chromium/Playwright integration test ran the actual 0.8.3 HTML, CSS and JavaScript with the ten real bundled map packs. API responses were mocked locally so the UI and browser export pipeline could be exercised without changing the live Vercel deployment.

- World map geometry loaded: 257 selectable regions.
- Applying `#4dff00` to China updated the live SVG fill and computed browser colour; the camera preview rendered 35,923 green pixels.
- Camera Map SVG contained the applied fill and no geometry outline strokes or selection state class.
- Country PNG output was 512 × 512, contained 66,845 applied-colour pixels, and kept 191,921 pixels transparent.
- Repeated the Country PNG export in Physical mode: applied colour remained visible and overrode the physical relief texture for that selected country.
- Positioned-country ZIP contained `camera-map-with-country-highlight.jpg`, `country-at-camera-position.png`, `placement.json`, and `IMPORT-INSTRUCTIONS.txt`.
- The JPEG and transparent PNG shared the exact 3840 × 3652 camera dimensions. The PNG alpha channel remained transparent, metadata recorded the applied colour, and the JPEG rendered the selected colour.
- No uncaught browser errors or console errors occurred in this test.

## Release behaviour

1. Apply to selection sets the selected fill/border attributes; CSS no longer replaces the chosen fill. Live map and camera/country export previews refresh.
2. Camera Map SVG preserves the current camera framing and applied fills, but removes geometry outline strokes and editor selection effects.
3. Country PNG exports the selected country's applied fill colour even while the editor is in Physical mode; when no custom fill is applied, physical relief texture remains available.
4. Positioned-country ZIP contains a transparent full-camera-frame country PNG, a flattened full-camera JPEG with the applied colour, `placement.json`, and import instructions. The JPEG is opaque; use the PNG as the independent compositor overlay.

## Not verified

- The actual Vercel-hosted tab was inspected, but the connected Browser integration here exposes read-only page inspection, not interactive click/download control. The local Chromium integration test therefore does not claim to have tested the public Vercel domain or its current deployment. Deploy this 0.8.3 package before retesting the live URL.
- Vercel preview uploads/project saves still use temporary `/tmp` storage. Persistent cloud database/object storage is not configured.


## 0.8.8 interactive calibration verification

- The calibration page can preview the uploaded reference crop before all control points are entered.
- Clicking the preview records X/Y against the original reference image dimensions.
- Three geographic control points enable the affine preview and full-frame transparent PNG package.
- Incomplete calibration keeps export disabled.
- The crop presets use distinct bounds for South Asia and India + neighbours.
