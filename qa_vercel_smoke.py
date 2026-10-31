"""Smoke-test the FastAPI app in Vercel-style temporary-storage mode.

Run: python qa_vercel_smoke.py
Requires: pip install -r requirements-dev.txt
"""
from __future__ import annotations

import base64
import os
from pathlib import Path
import tempfile

TEMP_DIR = tempfile.TemporaryDirectory(prefix="mapmotion-vercel-qa-")
ROOT_FOR_FIXTURE = Path(__file__).resolve().parent
BUNDLED_FIXTURE = ROOT_FOR_FIXTURE / "storage" / "maps" / "__qa-bundled-fixture__"
BUNDLED_FIXTURE.mkdir(parents=True, exist_ok=True)
(BUNDLED_FIXTURE / "metadata.json").write_text(
    '{"id":"qa-bundled-map","name":"QA Bundled Map","category":"World Maps"}',
    encoding="utf-8",
)
(BUNDLED_FIXTURE / "world-india.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="bundled" d="M1 1 H9 V9 H1 Z"/></svg>',
    encoding="utf-8",
)
os.environ["VERCEL"] = "1"
os.environ["MAPMOTION_DATA_DIR"] = TEMP_DIR.name

from fastapi.testclient import TestClient  # noqa: E402
from backend.app import app, DB, MAPS, ROOT  # noqa: E402


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    temp_root = Path(TEMP_DIR.name).resolve()
    check(DB.parent == temp_root, "SQLite DB must use the configured temporary directory")
    check(MAPS.parent == temp_root, "Uploaded maps must use the configured temporary directory")
    check(DB.parent != ROOT, "Vercel smoke test must not write the DB into the deployment source")

    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII="
    )
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path id="QA-Test" d="M5 5 H95 V55 H5 Z"/></svg>'

    with TestClient(app) as client:
        page = client.get("/")
        check(page.status_code == 200 and "MapMotion Studio" in page.text, "Home page must load")

        js = client.get("/assets/app.js")
        css = client.get("/assets/styles.css")
        check(js.status_code == 200 and "cameraViewBoxFromState" in js.text, "Frontend JS asset must load")
        check("VERCEL_UPLOAD_SAFE_BYTES=4*1024*1024" in js.text, "Hosted-preview upload size guard must be present")
        check(css.status_code == 200 and ".shell" in css.text, "Frontend CSS asset must load")

        health = client.get("/api/health")
        check(health.status_code == 200, "Health endpoint must return 200")
        health_data = health.json()
        check(health_data.get("ok") is True, "Health endpoint must report ok")
        check(health_data.get("version") == "0.8.1", "Health endpoint must report 0.8.1")
        check(health_data.get("storage_mode") == "ephemeral", "Vercel mode must clearly report ephemeral storage")
        check(health_data.get("persistent_storage_configured") is False, "Vercel preview must not claim persistence")

        initial_maps = client.get("/api/maps")
        check(initial_maps.status_code == 200, "Bundled map library endpoint must load")
        bundled = next((item for item in initial_maps.json() if item["id"] == "qa-bundled-map"), None)
        check(bundled is not None, "Read-only bundled map should be registered in Vercel mode")
        bundled_asset = client.get("/api/maps/qa-bundled-map/asset/world-india.svg")
        check(bundled_asset.status_code == 200, "Bundled SVG must be readable from the deployment source")
        bundled_upload = client.post(
            "/api/maps/qa-bundled-map/satellite",
            files={"satellite": ("qa.png", tiny_png, "image/png")},
        )
        check(bundled_upload.status_code == 200, "Updating a bundled map must copy it into writable temporary storage")
        check((MAPS / "__qa-bundled-fixture__" / "metadata.json").is_file(), "Copy-on-write map folder must be present under the temporary directory")

        uploaded = client.post(
            "/api/maps",
            data={"name": "QA Test Map", "category": "Custom Uploaded Maps"},
            files={"svg": ("qa-map.svg", svg, "image/svg+xml")},
        )
        check(uploaded.status_code == 200, f"SVG map upload must succeed: {uploaded.text}")
        map_data = uploaded.json()["map"]
        map_id = map_data["id"]

        listed = client.get("/api/maps")
        check(listed.status_code == 200 and any(item["id"] == map_id for item in listed.json()), "Uploaded map must appear in library")

        asset = client.get(f"/api/maps/{map_id}/asset/world-india.svg")
        check(asset.status_code == 200 and b"<svg" in asset.content, "Uploaded SVG asset must be downloadable")

        satellite = client.post(
            f"/api/maps/{map_id}/satellite",
            files={"satellite": ("qa.png", tiny_png, "image/png")},
        )
        check(satellite.status_code == 200, f"Satellite upload must succeed: {satellite.text}")

        verified = client.post(
            f"/api/maps/{map_id}/verify-pair",
            data={"verified": "true", "notes": "QA check", "scale": "100", "x": "0", "y": "0", "opacity": "55"},
        )
        check(verified.status_code == 200 and verified.json()["metadata"]["pairing_status"] == "verified", "Pair verification must update metadata")

        saved = client.post(
            "/api/projects",
            json={"name": "QA Project", "map_id": map_id, "data": {"view": "world", "zoom": 1}},
        )
        check(saved.status_code == 200, f"Project save must succeed: {saved.text}")
        project_id = saved.json()["id"]
        projects = client.get("/api/projects")
        check(projects.status_code == 200 and any(item["id"] == project_id for item in projects.json()), "Saved project must be listed")
        deleted = client.delete(f"/api/projects/{project_id}")
        check(deleted.status_code == 200 and deleted.json().get("ok") is True, "Project delete must succeed")

        bad_svg = client.post(
            "/api/maps",
            data={"name": "Unsafe"},
            files={"svg": ("unsafe.svg", b'<svg><script>alert(1)</script></svg>', "image/svg+xml")},
        )
        check(bad_svg.status_code == 400, "Unsafe active SVG content must be rejected")

    print("PASS: Vercel-mode home page, static assets, health, bundled-map read/copy-on-write, SVG upload, asset fetch, satellite upload, pair verification, project CRUD and SVG safety.")
    print("PASS: SQLite and uploaded content are routed to the configured temporary data directory.")
    print("NOTE: This validates temporary preview storage only; it does not test durable cloud persistence.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEMP_DIR.cleanup()
        import shutil
        shutil.rmtree(BUNDLED_FIXTURE, ignore_errors=True)
