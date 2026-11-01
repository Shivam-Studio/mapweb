# Vercel deployment — MapMotion Studio 0.8.8

## Deploy the complete application

MapMotion Studio is one FastAPI application serving the browser workspace, API, and bundled starter map library. Set the Vercel Root Directory to the repository root (`./`), not `frontend/` or `backend/`.

### Required Vercel project settings

- Git repository: `Shivam-Studio/mapweb`
- Production branch: `main`
- Root Directory: `./`
- Framework preset: FastAPI
- Build command: default / automatic
- Output directory: empty
- Install command: default / automatic

The current deployment project is `mapweb-p412` (`https://mapweb-p412.vercel.app/`), imported from `Shivam-Studio/mapweb`. Confirm that each deployment source commit matches the latest `main` commit.

## GitHub Git LFS setup for uploaded maps

The map upload path no longer writes uploaded files to Vercel `/tmp`. The large bytes go directly from the user's browser to GitHub Git LFS using the LFS Batch API upload action. FastAPI only authorizes the short-lived upload action and commits the small LFS pointer, map metadata, and catalog to the repository.

### 1. Push the updated project first

Push this ZIP's code to `Shivam-Studio/mapweb` and confirm that `.gitattributes` is committed. It must contain:

```gitattributes
storage/maps/user-uploads/** filter=lfs diff=lfs merge=lfs -text
```

### 2. Create a GitHub token

Create a fine-grained personal access token scoped only to `Shivam-Studio/mapweb`, with **Contents: Read and write**. Keep the token private. It is used only by the FastAPI server to call GitHub's repository and Git LFS APIs; it is never sent to the browser.

### 3. Add Vercel Environment Variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `MAPMOTION_GITHUB_OWNER` | `Shivam-Studio` (repository owner / organization) |
| `MAPMOTION_GITHUB_USERNAME` | Your personal GitHub username used for Git LFS Basic authentication |
| `MAPMOTION_GITHUB_REPO` | `mapweb` |
| `MAPMOTION_GITHUB_BRANCH` | `main` |
| `MAPMOTION_GITHUB_TOKEN` | Your fine-grained GitHub token |
| `MAPMOTION_UPLOAD_KEY` | A separate long random secret that only the map administrator knows |
| `MAPMOTION_MAX_LFS_FILE_MB` | Optional; defaults to `2000` MB |

Save Production (and Preview if needed) values, then redeploy. Never commit these values to `.env`, source code or ZIP files. `.env.example` contains names and placeholders only.

For a random upload key, generate one locally, for example in PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Enter the value when MapMotion Studio prompts for the **MapMotion Git upload key**. The browser keeps it in page memory only.

### 4. What gets committed

New map assets are stored in `storage/maps/user-uploads/<map-id>/`. Satellite images added to bundled maps are stored under `storage/maps/user-uploads/_overrides/<map-id>/` and paired with the bundled base geometry. Each large file is a Git LFS object; Git contains only its small pointer file. Map metadata and `storage/maps/user-uploads/catalog.json` are ordinary small Git files. Map listing and asset downloads read from this Git-backed catalog.

Map files and satellite images are durable in GitHub LFS after the pointer/catalog commit succeeds. The browser uploads directly to the temporary LFS URL returned by GitHub; files do not pass through a Vercel Function request body. The app's old multipart upload endpoints are intentionally rejected on Vercel to prevent silent `/tmp` storage.

## GitHub LFS limits and costs

This does not mean infinite storage. Current maximum per-file LFS sizes are:

- GitHub Free / Pro: 2 GB
- GitHub Team: 4 GB
- GitHub Enterprise Cloud: 5 GB

The app defaults to 2 GB per file. Only raise `MAPMOTION_MAX_LFS_FILE_MB` when the repository owner's GitHub plan allows it.

Included LFS allowance is currently 10 GiB storage + 10 GiB monthly download bandwidth on Free/Pro, and 250 GiB of each on Team/Enterprise Cloud. Large map downloads consume bandwidth. Over-quota usage can be billed, or LFS uploads/downloads can be blocked when the account has no overage payment/budget. Review GitHub LFS usage and billing before scaling a public map library.

Official references:
- Git LFS per-file limits: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage
- Git LFS storage/bandwidth quota: https://docs.github.com/en/billing/concepts/product-billing/git-lfs
- Git LFS Batch API: https://github.com/git-lfs/git-lfs/blob/main/docs/api/batch.md
- Vercel Function request-body limit: https://vercel.com/docs/functions/limitations

## Persistence boundary

**Map assets:** GitHub Git LFS (durable, subject to GitHub plan limits and quota).

**Saved projects:** SQLite under Vercel `/tmp` (temporary and not shared across function instances). This release does not migrate saved projects to Git. Do not treat project saves as backups.

## Verify after deployment

1. `/` renders MapMotion Studio 0.8.8 with ten bundled starter maps.
2. `/api/health` reports `map_storage_mode: "github-lfs"` and `github_lfs.configured: true`.
3. `/api/maps` returns all ten bundled maps and any records in `storage/maps/user-uploads/catalog.json`.
4. Upload a small test SVG and confirm GitHub receives a commit under `storage/maps/user-uploads/<map-id>/` plus an updated `catalog.json`.
5. Upload a satellite image from the Pairing screen and confirm its LFS pointer is committed under the same map ID (or the `_overrides` folder for a bundled map).
6. Refresh the Vercel page and verify the uploaded map remains listed and its SVG/image can be loaded.
7. Verify that saved project data is still labelled temporary until a durable project database is implemented.

The included automated QA uses mocked GitHub responses. It does not replace this live integration test with your own token and repository.

## Starter maps

The application includes ten starter maps: World Map — India View, World Satellite Map — India View, World Physical Map — India View, Asia, Europe, Africa, North America, South America, Oceania, and India & Neighbours. Boundary data attribution and licensing are documented in `storage/maps/ATTRIBUTION.md`.

## 0.8.8 bundled map and export verification

After deploy, apply a bright country fill and verify the same selected fill remains in the live editor, Camera Map SVG, Country PNG, and positioned-country ZIP. This release changes map storage only; the 0.8.3 selection/export fixes are retained.


## 0.8.8 Global Position AutoPlacer verification

1. Open **Global Position AutoPlacer** from the workspace navigation.
2. Confirm the geoBoundaries India ADM1 dataset loads (36 state / UT boundary features; source metadata represents 2011 boundaries).
3. Select a state, select a geographic crop preset and set the canvas to the exact dimensions of the base map used in Alight Motion.
4. For a third-party image with unknown projection or crop bounds, use three well-separated control points and their source-image pixel coordinates.
5. Export the ZIP and import the full-canvas transparent PNG above the matching base map without independently scaling or cropping either layer.

Preset registration is exact only when the reference image shares the selected projection and exact geographic bounds. Three-point affine calibration is approximate between the control points, particularly on large or strongly curved projections. Existing supplied SVGs without a verified georeference are not assumed to have geographic bounds.
