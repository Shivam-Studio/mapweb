# Deployment repair QA — MapMotion Studio 0.8.1

## Local checks performed

- `node --check frontend/app.js` — passed.
- `python -m py_compile app.py backend/app.py` — passed.
- `node QA_CAMERA_TEST.js` — passed.
- FastAPI `TestClient` with `VERCEL=1` — `GET /`, `GET /assets/app.js`, `GET /assets/styles.css`, `GET /api/health`, and `GET /api/maps` all returned HTTP 200.
- `/api/health` reported `runtime: vercel` and `persistent_storage_configured: false`.
- `/api/maps` returned an empty list because no redistributable map pack is committed in the public repository.

## Structural changes

- Added root `app.py` as the conventional FastAPI entrypoint, re-exporting `backend.app:app`.
- Changed `pyproject.toml` to `entrypoint = "app:app"`.
- Repaired root `requirements.txt`; removed Git conflict markers that had been committed accidentally.
- Kept the backend and frontend in one repository. The backend serves the HTML at `/`, static files at `/assets/*`, and API routes at `/api/*`.
- Added explicit frontend error and empty-map states instead of leaving “Loading library…” / “Loading vector geometry…” indefinitely.
- Added deployment instructions that require Vercel Root Directory `./` and the `Shivam-Studio/mapweb` repository.

## Not verified

- No live Vercel deployment was performed from this package.
- The Vercel project inspected during review was connected to `stephinhenry91-design/mapweb` at its `Initial commit`, not the `Shivam-Studio/mapweb` repository. That project needs to be reconnected or recreated from the correct repository.
- Persistent PostgreSQL/object storage, authentication, and durable user uploads are not configured. `/tmp` on Vercel is temporary.
- Bundled map assets were not added because their public redistribution rights have not been established. A fresh deployment will show a clear empty-library state until a licensed map pack is added.

## GitHub connector limitation

A direct GitHub write attempt was rejected with HTTP 403 `Resource not accessible by integration`. The repository was readable, but the connected integration did not grant write access for creating Git blobs. The included `PUSH_TO_GITHUB.bat` is provided for the user's authenticated local Git installation; no successful remote push is claimed in this report.
