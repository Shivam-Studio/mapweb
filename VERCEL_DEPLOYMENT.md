# Vercel deployment — MapMotion Studio 0.8.1

## Deploy the full application, not the frontend folder

MapMotion Studio is one FastAPI application that serves both the API and the browser interface. Do **not** deploy `frontend/` as a separate static Vercel project. The HTML loads `/assets/styles.css` and `/assets/app.js`, while those assets and the `/api/*` endpoints are served by `backend.app:app`.

### Required Vercel project settings

- Git repository: `Shivam-Studio/mapweb`
- Production branch: `main`
- Root Directory: `./` (the repository root; not `frontend` or `backend`)
- Framework preset: FastAPI / automatic FastAPI detection
- Build command: leave empty / automatic
- Output directory: leave empty

The Vercel project seen during review was `mapweb-frontend-f3ei`, connected to `stephinhenry91-design/mapweb` at commit `48de3a3` (`Initial commit`). That is a separate frontend-only source and will not receive pushes made to `Shivam-Studio/mapweb`. Reconnect it to the repository above, or create a new Vercel project from that repository.

## Repository layout

```text
mapweb/
├── app.py                 # Root FastAPI entrypoint detected by Vercel
├── pyproject.toml         # Python metadata and Vercel entrypoint
├── requirements.txt       # Root runtime dependencies
├── backend/
│   ├── __init__.py
│   ├── app.py              # API + serves index and /assets
│   └── requirements.txt    # Windows launcher dependencies
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── storage/maps/           # Optional, licensed bundled map packs
└── run_windows.bat         # Local Windows launcher only
```

The root `app.py` re-exports `backend.app:app`. `pyproject.toml` also sets `entrypoint = "app:app"` as a deterministic explicit entrypoint.

## Verify after deployment

1. `/` should render the MapMotion Studio UI.
2. `/assets/app.js` and `/assets/styles.css` should return HTTP 200.
3. `/api/health` should return JSON with `ok: true` and `runtime: "vercel"`.
4. `/api/maps` should return the registered bundled map list (or `[]` when no licensed map packs are included).
5. If the browser shows `API disconnected`, `Loading library…` forever, or `Loading vector geometry…`, check the project root and API runtime rather than styling the HTML.

## Map packs and licensing

The repository intentionally excludes map source files and satellite imagery where redistribution rights have not been confirmed. A clean deployment may therefore show an empty Map Library. Add only map packs you own or are licensed to redistribute, under `storage/maps/<map-id>/`, containing `metadata.json` and `world-india.svg`. Optional assets such as `physical.svg`, `physical-texture.png` and `thumbnail.png` may also be included. Do not commit paid or third-party map assets without permission to redistribute them publicly.

## Storage limitations

Vercel's writable `/tmp` directory is temporary and is not shared durable storage. This preview mode can demonstrate the app and API, but uploaded maps and SQLite projects may disappear across function restarts or different instances. Production use requires a persistent database and object storage, plus authentication/authorization and upload controls. No external credentials are bundled or invented.

Vercel Functions also impose request/response payload limits. The hosted UI conservatively blocks uploads above 4 MB per request; larger files need direct object-storage uploads.
