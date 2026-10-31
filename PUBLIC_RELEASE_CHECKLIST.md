# Public release checklist — MapMotion Studio 0.8.1

- [ ] Confirm the GitHub repository is `Shivam-Studio/mapweb`.
- [ ] Review map-data and satellite-imagery redistribution licences before adding any map pack.
- [ ] Ensure no `.env`, token, credential, SQLite database, local project data or private map is staged.
- [ ] Run `node --check frontend/app.js`.
- [ ] Run `python -m py_compile backend/app.py`.
- [ ] Run `node QA_CAMERA_TEST.js`.
- [ ] Run `python qa_vercel_smoke.py` after installing `requirements-dev.txt`.
- [ ] Push using `PUSH_TO_GITHUB.bat`; do not force-push.
- [ ] Connect Vercel to `Shivam-Studio/mapweb`, not the previously shown `stephinhenry91-design/mapweb` source.
- [ ] Set the Vercel Root Directory to `./`.
- [ ] Enable Vercel Deployment Protection for preview URLs; add application authentication and per-user authorization before public production.
- [ ] Check `/api/health` and confirm the app warns about temporary storage.
- [ ] Before production, provision persistent PostgreSQL and object storage and migrate uploads/projects away from `/tmp`.
- [ ] Use direct-to-object-storage uploads for SVG/raster assets larger than Vercel Functions 4.5 MB request/response limit.
- [ ] Test current camera, country PNG and positioned-country ZIP exports in the actual deployed browser.
