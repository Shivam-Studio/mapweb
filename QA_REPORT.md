# MapMotion Studio 0.8.0 — QA Report

## Scope
Verified the three-action animator export workflow against the actual frontend source and bundled SVG/physical texture assets using isolated Chromium. Browser API calls were mocked for deterministic frontend tests; FastAPI was tested separately with a temporary SQLite data directory.

## Export checks

The editor presents the three animator actions in workflow order: Camera Map SVG first, cropped Country PNG second, and Country + exact map position third. A browser regression assertion verifies this order and that exactly three export buttons are present.

| Test | Result | Evidence |
|---|---|---|
| Cropped country PNG | PASS | 3840×2160 transparent PNG; non-empty alpha bounds |
| Positioned country ZIP | PASS | ZIP integrity; includes PNG, `placement.json`, import instructions |
| Position sidecar | PASS | Map ID/source SVG fingerprint (SHA-256 where Web Crypto is available, stable non-cryptographic FNV-1a fallback otherwise), source viewBox, camera viewBox, pan/zoom, source bounds, visible pixel bounds and normalized bounds included |
| Pixel placement | PASS | PNG alpha bounds agree with sidecar visible bounds within 2 px |
| Camera Map SVG | PASS | Same dimensions and exact `viewBox` as positioned PNG; selection/highlight metadata removed; action exports map-only camera frame |
| Physical positioned export | PASS | Embedded relief clipped to selected geometry; 10,668 distinct RGB colours inside country |
| 8K camera preset | PASS | SVG rendered; effective frame 6087×5512 (auto-limited to 32 MP) |
| Responsive layout | PASS | 320, 360, 375, 390, 430, 600, 760, 768, 850, 1024, 1440 px; no horizontal overflow |
| Browser console/page errors | PASS | None in harness |

## Backend checks

- `GET /api/health`: 200, reports version 0.8.0.
- Map library: all 3 bundled map records present.
- SVG asset routes: all 3 world boundary assets returned successfully.
- Project create/list/delete round-trip: PASS.
- SQLite `PRAGMA integrity_check`: `ok`.

## Static checks

- `node --check frontend/app.js`: PASS.
- `python -m py_compile backend/app.py`: PASS.
- `node QA_CAMERA_TEST.js`: PASS.
- Positioned-package map fingerprint is non-empty and records the algorithm used: PASS.
- ZIP CRC/integrity and one-root-folder structure: PASS.
- No database or Python cache files included in release archive.

## Known limitations

1. Exact placement is guaranteed in the matching source-map SVG coordinate frame and exported camera frame. It does not create trustworthy latitude/longitude unless the source map is properly georeferenced.
2. The base camera SVG and positioned country package must be exported from the same map asset and unchanged camera state. Convert the base SVG to PNG without changing its output pixel dimensions if the target editor requires raster imagery.
3. Camera frames are automatically scaled down when a raster companion would exceed the 32-megapixel safe canvas limit. Actual dimensions are shown in the editor and included in the sidecar.
4. Browser tests used isolated Chromium and mocked API responses; the user's Windows Chrome session was not controlled.
