# MapMotion Studio 0.8.1 — Final package QA report

## Scope

This report covers the Vercel deployment configuration, local source static checks, camera math regression tests, and an automated FastAPI smoke test running in Vercel-style temporary-storage mode. It does not claim that a deployment has been performed on the user's Vercel account.

## Vercel configuration review

| Check | Expected / result |
|---|---|
| `pyproject.toml` custom entrypoint | `backend.app:app` |
| Root `requirements.txt` | Present; includes FastAPI, Uvicorn and multipart parsing |
| `.python-version` | Python 3.12 |
| Vercel data directory | `/tmp/MapMotionStudio` (or `MAPMOTION_DATA_DIR` override) |
| Local Windows database | Remains under `%LOCALAPPDATA%\MapMotionStudio` |
| Public bundled map packs | Excluded until redistribution permissions are confirmed |
| Vercel persistent storage | Not configured; preview mode is explicitly marked ephemeral |
| Vercel upload/response payloads | 4.5 MB platform ceiling documented; UI uses a conservative 4 MB upload guard |

## Automated checks

Run the following in the project root:

- `node --check frontend/app.js`
- `python -m py_compile backend/app.py`
- `python -m py_compile qa_vercel_smoke.py`
- `node QA_CAMERA_TEST.js`
- `python qa_vercel_smoke.py`

The Vercel smoke script verifies:

- `/` responds with the MapMotion Studio page.
- `/assets/app.js` and `/assets/styles.css` are served.
- `/api/health` reports version 0.8.1, Vercel runtime, ephemeral storage and no persistent storage configured.
- Empty map library responds cleanly.
- SVG map upload and asset download work.
- Satellite upload and manual pair verification work.
- Project create/list/delete works.
- Unsafe active SVG content is rejected.
- SQLite and user uploads use the configured temporary data directory, not the deployment source folder.

## Browser export regression

The dependency-free `QA_CAMERA_TEST.js` verifies the map-camera framing function for the base frame, 2x zoom, pan offsets and portrait viewport geometry.

The 0.8.0 three-export workflow and browser export harness remain documented in the previous QA history. This package does not re-run the full Chromium 4K/8K image-export matrix in this environment; the included smoke test is focused on Vercel startup and API/storage compatibility.

## Known production blockers

1. The original app is a local single-user MVP and has no application authentication, authorization or per-user data isolation. Protect previews with Vercel Deployment Protection and add application auth before public production.
2. `/tmp` storage is temporary and cannot be used as durable user storage.
3. Persistent PostgreSQL and object storage are not provisioned or configured in this package.
4. Public development map packs and satellite imagery are intentionally not included; the Map Library starts empty unless an administrator adds properly licensed map assets.
5. Vercel Function requests and responses are limited to 4.5 MB. The UI blocks larger uploads in preview mode; large map assets need direct-to-object-storage upload and CDN delivery.
6. The Vercel project's connected Git repository must be changed to `Shivam-Studio/mapweb`; the supplied deployment log previously showed `stephinhenry91-design/mapweb`.
7. The final deployed result must still be verified in the user's Vercel project and browser after pushing.

## QA honesty note

A passing local smoke test confirms the included code paths tested here. The authoring container had preinstalled FastAPI 0.128.2, Starlette 0.50.0 and HTTPX 0.28.1; internet access was unavailable, so the pinned runtime packages in `requirements.txt` could not be freshly downloaded here. Vercel must still resolve the pinned dependencies during its own build. These checks do not confirm Vercel account permissions, the connected Git repository, environment settings, remote build success, or persistent cloud storage.
