# Vercel deployment guide — MapMotion Studio 0.8.1

## What this package fixes

- Adds the custom FastAPI entrypoint Vercel reported missing: `backend.app:app`.
- Adds a root `requirements.txt` and Python 3.12 runtime declaration.
- Keeps the Windows local launcher working.
- Redirects Vercel writes (SQLite, user-uploaded maps and project folders) into `/tmp/MapMotionStudio` instead of attempting to write into the read-only deployment bundle.
- Keeps bundled map assets read-only and copies a bundled map into temporary storage before an edit operation needs to write metadata or imagery.
- Shows a clear temporary-storage warning in the app when running on Vercel.

## Connect the correct repository first

The deployment log supplied for the earlier failed build said it cloned `stephinhenry91-design/mapweb` at commit `48de3a3` (`Initial commit`). The code repository reviewed for this package is `Shivam-Studio/mapweb`.

In the Vercel project:

1. Open **Settings → Git**.
2. Disconnect the unintended repository if Vercel allows changing it there.
3. Connect **Shivam-Studio/mapweb** and select the `main` production branch.
4. In **Settings → Build and Deployment**, set **Root Directory** to `./` (repository root).
5. Keep Framework Preset on **FastAPI** / automatic detection. Do not add a custom build command or output directory for this package.
6. Redeploy the latest `main` commit.

If Vercel does not allow changing the connected repository in place, create a new Vercel project from `Shivam-Studio/mapweb` instead.

## Entry point and dependencies

The root `pyproject.toml` includes:

```toml
[tool.vercel]
entrypoint = "backend.app:app"
```

The root `requirements.txt` provides the Python dependencies. The `backend/requirements.txt` file remains for the Windows launcher.

## Critical storage limitation — preview only

Vercel Functions have a read-only deployment filesystem with writable temporary `/tmp` scratch space. This package uses `/tmp/MapMotionStudio` so the API can start and the editor can be exercised without write attempts against the deployed source directory.

**Files written to `/tmp` are temporary and are not durable storage.** Depending on function lifecycle and scaling, uploaded maps, satellite images and saved projects may disappear or be unavailable in another function instance. This means the Vercel deployment is a build/runtime preview, not yet a reliable multi-user production workspace.

Before production use, configure:

- A persistent database (PostgreSQL recommended) for maps metadata and saved projects.
- Persistent object storage for SVG, raster and uploaded map assets.
- Database and storage credentials as Vercel Environment Variables.
- A migration from the current SQLite schema to the selected cloud database.

This package does not invent cloud credentials or silently claim that `/tmp` is persistent. No Supabase, Neon or object-storage account is created by this ZIP.


## Access protection before sharing the deployment

This MVP was originally designed as a local, single-user workspace and does not yet include user authentication, authorization or per-user project isolation. Before sharing a Vercel preview URL, enable Vercel Deployment Protection for the preview environment. Before public production use, implement application authentication, ownership checks, upload quotas and rate limiting. Temporary storage is not an access-control mechanism.

## Vercel request and response size limit

Vercel Functions currently enforce a 4.5 MB maximum request body and a 4.5 MB maximum response body. The hosted-preview UI therefore blocks uploads above a conservative 4 MB total per request. This includes the map SVG and optional satellite file together; satellite replacement uploads also use the same conservative limit. API asset downloads routed through the function are subject to the response limit too. The app's larger 30 MB SVG / 80 MB satellite limits apply to local Windows use, not the Vercel function route. For larger map files, upload directly to object storage and serve them from its CDN or signed URLs. See Vercel's [Function limits](https://vercel.com/docs/functions/limitations) and [large file upload guidance](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions).

## Map library contents

The public source repository intentionally excludes development map packs and satellite imagery where redistribution permission was not established. A fresh deploy therefore starts with an empty Map Library. Upload an SVG boundary file that you own or are licensed to use. On Vercel preview mode, remember that the uploaded file is temporary until persistent object storage has been integrated.

## Health check

After deployment, open:

- `/` — MapMotion Studio interface.
- `/api/health` — reports `ok: true`, app version, runtime and storage mode.

For the current Vercel preview configuration, `/api/health` should show:

```json
{
  "ok": true,
  "version": "0.8.1",
  "runtime": "vercel",
  "storage_mode": "ephemeral",
  "persistent_storage_configured": false
}
```

The exact response includes a warning field. Do not treat `persistent_storage_configured: false` as a production-ready storage setup.
