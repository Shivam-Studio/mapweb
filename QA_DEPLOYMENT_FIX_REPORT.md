# QA Report — MapMotion Studio 0.8.2 Starter Map Release

## Bundled map collection

Nine starter maps are included and registered from the read-only deployment source:

| Map | Editable paths | Physical layer |
|---|---:|---|
| World Map — India View | 257 | Yes |
| World Physical Map — India View | 257 | Yes |
| Asia Map | 51 | Yes |
| Europe Map | 54 | Yes |
| Africa Map | 61 | Yes |
| North America Map | 41 | Yes |
| South America Map | 16 | Yes |
| Oceania Map | 24 | Yes |
| India & Neighbours Map | 10 | Yes |

The country boundary SVGs preserve the amCharts credit. `storage/maps/ATTRIBUTION.md` documents the CC BY 4.0 attribution. Physical terrain is project-generated illustrative shaded relief, not measured elevation data. No satellite image is bundled.

## Checks actually run

- `node --check frontend/app.js` — passed.
- `python -m py_compile app.py backend/app.py qa_vercel_smoke.py` — passed.
- `node QA_CAMERA_TEST.js` — passed (base viewBox, zoom, pan, portrait viewport framing).
- `python qa_vercel_smoke.py` with `VERCEL=1` and an isolated temporary data directory — passed.
- The Vercel-mode smoke test confirmed all nine map IDs register and each SVG, physical SVG, physical PNG texture, and thumbnail route returns valid content.
- The same smoke test verified home/static assets, health response version 0.8.2, read-only bundled map access, copy-on-write for a bundled map, SVG upload and retrieval, satellite upload, pair verification, project create/list/delete, SVG safety rejection, and use of temporary storage for writes.
- Every map SVG and physical SVG was parsed and rendered with CairoSVG; all thumbnails and physical textures opened successfully with Pillow.
- `.gitignore` behaviour was tested in an isolated Git repository: all nine starter-map directories are trackable; a sample private user-upload folder remains ignored.

## Not claimed as tested

- No new GitHub push was performed from the connected integration. Its write operation previously returned HTTP 403. Use the included Windows `PUSH_TO_GITHUB.bat`.
- No new live Vercel deployment was triggered from this workspace. After pushing, verify the new deployment's source commit on `mapweb-p412`.
- The upload/edit/export interaction sequence was not browser-click-tested in this run. With the nine starter maps loaded, it can now be tested in the live editor.

## Remaining production limitation

Vercel preview uploads and project data still use temporary `/tmp` SQLite/files. Persistent PostgreSQL/object storage and authentication are not configured; user uploads and saved projects are not guaranteed to survive restarts or be shared across serverless instances. The built-in starter maps are part of the deployment bundle and are read-only.
