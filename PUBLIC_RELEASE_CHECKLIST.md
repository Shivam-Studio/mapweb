# Public release checklist — MapMotion Studio 0.8.2

- [x] Repository target documented as `Shivam-Studio/mapweb`.
- [x] Nine starter maps included: world (India view), world physical (India view), Asia, Europe, Africa, North America, South America, Oceania, India & Neighbours.
- [x] amCharts map attribution and CC BY 4.0 notice included in SVGs, metadata, and `storage/maps/ATTRIBUTION.md`.
- [x] No satellite imagery or user-uploaded/private project data is bundled.
- [x] `.gitignore` whitelists only the curated starter map packs and still ignores user uploads.
- [x] `vercel.json` explicitly includes `storage/maps/**` in the root FastAPI function.
- [x] Python compile, JavaScript syntax, SVG/PNG asset rendering, Vercel-mode API smoke, and camera regression checks passed locally.
- [ ] Push using `PUSH_TO_GITHUB.bat`; never force-push.
- [ ] Confirm Vercel deployment source commit equals latest `main`.
- [ ] Test uploads, pairing, camera editing, all three exports, and project CRUD in the deployed browser.
- [ ] Before production, configure persistent PostgreSQL and object storage, user authentication/authorization, and durable upload handling.

## Known release limitation

Vercel preview uploads and saved projects still use temporary `/tmp` storage. The built-in maps are bundled, but user uploads and saved projects are not durable until persistent cloud services are connected.
