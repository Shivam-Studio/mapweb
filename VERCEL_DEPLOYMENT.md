# Vercel deployment — MapMotion Studio 0.8.2

## Deploy the complete application

MapMotion Studio is one FastAPI application serving the browser workspace, API, and bundled map library. Do **not** set the Vercel Root Directory to `frontend/` or `backend/`.

### Required Vercel project settings

- Git repository: `Shivam-Studio/mapweb`
- Production branch: `main`
- Root Directory: `./`
- Framework preset: FastAPI
- Build command: default / automatic
- Output directory: empty
- Install command: default / automatic

The current deployment project is `mapweb-p412` (`https://mapweb-p412.vercel.app/`), imported from `Shivam-Studio/mapweb`. Confirm that each new deployment's source commit matches the latest `main` commit. The older frontend-only project `mapweb-frontend-f3ei` was connected to a different repository and should not be used for this release.

## Repository layout

```text
mapweb/
├── app.py                 # Root FastAPI entrypoint
├── pyproject.toml         # Python metadata + app:app entrypoint
├── requirements.txt       # Runtime dependencies
├── vercel.json            # Explicitly bundles storage/maps/**
├── backend/               # API and static frontend serving
├── frontend/              # HTML, CSS, JavaScript
└── storage/maps/           # Nine read-only starter-map packs
```

The root `app.py` re-exports `backend.app:app`. `pyproject.toml` sets `entrypoint = "app:app"`. `vercel.json` explicitly includes `storage/maps/**` in the function bundle so dynamic map-directory discovery can read the bundled SVGs and textures at runtime. Vercel documents a 500 MB uncompressed Python function bundle limit; the starter-map collection is about 21 MB before compression. <https://vercel.com/docs/functions/runtimes/python>

## Starter map collection

The application includes nine starter maps: World Map — India View, World Physical Map — India View, Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours. All are visible in Map Library on a clean deployment. The country-boundary SVG preserves the amCharts credit and is attributed under CC BY 4.0; see `storage/maps/ATTRIBUTION.md` and https://amcharts.com/svg-maps/download/. The physical relief layer is illustrative generated artwork, not measured elevation data. No satellite imagery is bundled.

## Verify after deployment

1. `/` renders MapMotion Studio 0.8.2.
2. `/api/health` returns `ok: true`, version `0.8.2`, runtime `vercel`, and storage mode `ephemeral`.
3. `/api/maps` returns the nine bundled maps.
4. `/api/maps/world-india/asset/world-india.svg` returns the world SVG.
5. `/api/maps/world-india/asset/physical.svg` returns the physical layer.
6. `/api/maps/asia/asset/world-india.svg` and `/api/maps/oceania/asset/world-india.svg` return cropped regional SVGs.

## Storage limitation — preview mode

Vercel's writable `/tmp` directory is temporary and is not shared durable storage. User-uploaded maps and SQLite projects may disappear across function restarts or be unavailable on another function instance. Production use requires persistent PostgreSQL and object storage, plus authentication/authorization and upload controls. No external credentials are bundled.

The hosted UI conservatively blocks upload requests above 4 MB; Vercel Functions have a 4.5 MB request/response payload limit. Larger assets should use direct-to-object-storage uploads.
