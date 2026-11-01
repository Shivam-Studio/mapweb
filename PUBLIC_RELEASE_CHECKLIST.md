# Public release checklist — MapMotion Studio 0.8.9

- [x] Repository target documented as `Shivam-Studio/mapweb`.
- [x] Ten starter maps included; amCharts-derived assets retain CC BY 4.0 attribution.
- [ ] Confirm redistribution rights for the new user-supplied satellite SVG and physical PNG before public release.
- [x] `.gitattributes` tracks `storage/maps/user-uploads/**` using Git LFS.
- [x] Browser-to-GitHub LFS direct upload flow added; large map bytes bypass Vercel Function request limits.
- [x] Server-side token and separate admin upload-key configuration documented.
- [x] Git-backed map catalog, metadata, satellite uploads, and pairing updates implemented.
- [x] Python/JavaScript syntax, map export regressions, Vercel smoke checks, and mocked LFS routes pass.
- [ ] Push using `PUSH_TO_GITHUB.bat`; never force-push.
- [ ] Create a fine-grained token with Contents read/write and add the five `MAPMOTION_*` settings in Vercel.
- [ ] Confirm `/api/health` reports `map_storage_mode: github-lfs`.
- [ ] Test a real SVG + high-resolution satellite upload and verify the files persist after a page refresh.
- [ ] Test browser CORS to the signed Git LFS transfer URL with the deployed domain.
- [ ] Confirm GitHub LFS plan limits, monthly storage, bandwidth and billing budget.
- [ ] Keep project saves labelled temporary until a persistent project database is added.

## Known release limitation

Only map assets are Git-backed. Saved projects still use temporary Vercel `/tmp` SQLite. GitHub LFS is not unlimited; current per-file limits and plan quotas apply.
