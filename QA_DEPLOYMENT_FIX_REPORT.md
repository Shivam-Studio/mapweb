# QA Report — MapMotion Studio 0.8.4

## Bundled map collection

Nine starter maps remain included and registered from the read-only deployment source: World Map — India View, World Physical Map — India View, Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours. The country boundary SVGs preserve the amCharts credit and CC BY 4.0 attribution. Physical terrain is project-generated illustrative shaded relief, not measured elevation data.

## Checks run

- `node --check frontend/app.js` — passed.
- `node QA_GITHUB_LFS_TEST.js` — passed (incremental SHA-256 standard vectors and browser upload wiring).
- `node QA_CAMERA_TEST.js` — passed (base viewBox, zoom, pan and portrait viewport framing).
- `node QA_EXPORT_COLOUR_TEST.js` — passed (selection colour priority, outline-free camera export and positioned-country package).
- `python -m py_compile app.py backend/app.py backend/github_storage.py qa_vercel_smoke.py qa_github_lfs.py` — passed.
- `python qa_vercel_smoke.py` — passed (all nine bundled map routes, health, static files, project CRUD, and refusal to write map bytes to Vercel `/tmp` when Git LFS is not configured).
- `python qa_github_lfs.py` — passed (mocked LFS authorization, pointer commits, catalog listing, redirects, bundled-map satellite override, and Git-backed pairing metadata).

## Not verified against a live service

- No GitHub push was performed by this task. Use `PUSH_TO_GITHUB.bat` and confirm `.gitattributes` is committed.
- No live GitHub token, Git LFS signed upload URL, browser CORS transfer, or real Vercel environment-variable setup was available in this local QA run.
- No new live Vercel deployment was triggered. A live test with the configured token and upload key is still required after pushing.

## Persistence boundary

User-uploaded map assets and satellite images use GitHub Git LFS after successful LFS transfer and pointer/catalog commits. Saved project records still use Vercel `/tmp` SQLite and are not durable in this release. GitHub LFS per-file limits, storage quotas, download bandwidth and billing apply.
