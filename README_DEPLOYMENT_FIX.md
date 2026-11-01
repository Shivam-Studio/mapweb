# Deployment layout repair

This repository is a **single FastAPI application**, not a static-only frontend deployment. Use the repository root as the Vercel Root Directory. The root `app.py` exports the FastAPI object, and the backend serves the frontend at `/` and its assets at `/assets/*` while the same app handles `/api/*`.

See `VERCEL_DEPLOYMENT.md` for exact Vercel settings and verification routes.

Important: the Vercel project previously reviewed was connected to `stephinhenry91-design/mapweb` at an `Initial commit`, not this repository. That project must be reconnected to `Shivam-Studio/mapweb` or replaced with a new Vercel project based on this repository.

The `storage/maps` directory intentionally contains no bundled map packs until public redistribution rights are established. The application now displays an explicit empty-library state instead of leaving the editor on an endless loading message.
