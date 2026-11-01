# MapMotion Studio 0.8.3 — QA report

## Automated checks

- `node --check frontend/app.js` — passed.
- `node QA_CAMERA_TEST.js` — passed (camera viewBox, zoom, pan and portrait framing regression).
- `node QA_EXPORT_COLOUR_TEST.js` — passed (custom fill priority, physical-relief fallback, outline-free camera export, JPEG + transparent PNG package and preview-refresh wiring).
- `python -m py_compile app.py backend/app.py qa_vercel_smoke.py` — passed.
- `python qa_vercel_smoke.py` — passed (Vercel-mode FastAPI, frontend assets, health, all nine bundled maps and their asset routes, upload/pair/project API workflow and SVG safety checks).

## Browser integration checks

A local headless Chromium/Playwright integration test ran the actual 0.8.3 HTML, CSS and JavaScript with the nine real bundled map packs. API responses were mocked locally so the UI and browser export pipeline could be exercised without changing the live Vercel deployment.

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
