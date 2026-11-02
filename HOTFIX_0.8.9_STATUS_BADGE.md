# MapMotion Studio 0.8.9 — AutoPlacer status badge hotfix

## What the screenshot showed

The India state dropdown was populated, Uttar Pradesh was selected, a geographic preview was visible, and the UI showed a successful 3840 × 2160 export. The top-right `Boundary data unavailable` pill was therefore stale UI state, not proof that export had failed.

## What changed

- After a successful state preview, the badge is synchronized to `36 state / UT geometries loaded · geoBoundaries ADM1`.
- A late failure from an older concurrent/retried request no longer overwrites a newer successful load state.
- `frontend/index.html` uses a new cache key for `app.js` so the browser fetches the updated script.
- State geometry, crop registration and export implementation are otherwise unchanged.

## Publish

1. Extract this ZIP.
2. Copy the contents of `MapMotionStudio` into the existing `mapweb` Git working folder, replacing project files. Keep the existing `.git` folder and private `.env` file.
3. Commit and push the changed files to the `main` branch (or run the included `PUSH_TO_GITHUB.bat` from that existing Git folder).
4. Wait for the Vercel Production deployment to show `Ready`.
5. Reload the live site with `Ctrl + Shift + R`, open `Global AutoPlacer`, and check the top-right badge.

**Important:** This hotfix has been packaged and tested locally. It has not been pushed to GitHub or deployed to Vercel from this session because GitHub rejected the write request (HTTP 403).
