"""Smoke-test Vercel mode with GitHub Git LFS not configured.

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
    check(MAPS.parent == temp_root, "Writable scratch-map root must stay outside the read-only deployment source")
    check(DB.parent != ROOT, "Vercel smoke test must not write the DB into the deployment source")

    tiny_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII="
    )
    svg = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><path id="QA-Test" d="M5 5 H95 V55 H5 Z"/></svg>'

    with TestClient(app) as client:
        page = client.get("/")
        check(page.status_code == 200 and "MapMotion Studio" in page.text, "Home page must load")
        check("10 ready-to-edit maps" in page.text and "CC BY 4.0" in page.text, "Map Library must visibly advertise the starter maps and source license")

        js = client.get("/assets/app.js")
        css = client.get("/assets/styles.css")
        check(js.status_code == 200 and "cameraViewBoxFromState" in js.text, "Frontend JS asset must load")
        check("uploadNewMapToGithub" in js.text and "putFileToLfs" in js.text, "Browser-to-GitHub LFS upload flow must be present")
        check("VERCEL_UPLOAD_SAFE_BYTES" not in js.text, "The old Vercel 4 MB multipart upload guard must be removed")
        check(css.status_code == 200 and ".shell" in css.text, "Frontend CSS asset must load")

        health = client.get("/api/health")
        check(health.status_code == 200, "Health endpoint must return 200")
        health_data = health.json()
        check(health_data.get("ok") is True, "Health endpoint must report ok")
        check(health_data.get("version") == "0.8.9", "Health endpoint must report 0.8.9")
        check(health_data.get("storage_mode") == "ephemeral", "Vercel without GitHub credentials must report missing durable map storage")
        check(health_data.get("map_storage_mode") == "ephemeral", "Map storage must remain marked ephemeral until GitHub LFS is configured")
        check(health_data.get("persistent_storage_configured") is False, "Vercel preview must not claim map persistence without GitHub LFS")

        initial_maps = client.get("/api/maps")
        check(initial_maps.status_code == 200, "Bundled map library endpoint must load")
        all_maps = initial_maps.json()
        bundled = next((item for item in all_maps if item["id"] == "qa-bundled-map"), None)
        check(bundled is not None, "Read-only bundled fixture should be registered in Vercel mode")
        expected_starters = {"world-india", "world-satellite-india-view", "world-physical-india", "asia", "europe", "africa", "north-america", "south-america", "oceania", "india-neighbours"}
        registered_starters = {item["id"] for item in all_maps} & expected_starters
        check(registered_starters == expected_starters, f"All ten bundled starter maps must register; got {sorted(registered_starters)}")
        by_id = {item["id"]: item for item in all_maps}
        expected_categories = {
            "world-india": "World Maps",
            "world-physical-india": "World Maps",
            "world-satellite-india-view": "World Maps",
            "asia": "Continent Maps",
            "europe": "Continent Maps",
            "africa": "Continent Maps",
            "north-america": "Continent Maps",
            "south-america": "Continent Maps",
            "oceania": "Continent Maps",
            "india-neighbours": "Regional Maps",
        }
        for starter_id, category in expected_categories.items():
            check(by_id[starter_id]["category"] == category, f"{starter_id} must use the visible Map Library filter category {category}")
        for starter_id in sorted(expected_starters):
            check(by_id[starter_id]["metadata"].get("starter_asset") is True, f"{starter_id} must be marked as a starter asset")
            if starter_id == "world-satellite-india-view":
                check("User-supplied" in by_id[starter_id]["metadata"].get("source", ""), "New satellite map must retain user-supplied source metadata")
                check("not specified" in by_id[starter_id]["metadata"].get("license", ""), "New satellite map must not imply an unprovided redistribution license")
            else:
                check(by_id[starter_id]["metadata"].get("source_credit") == "Map by amCharts", f"{starter_id} must include visible map attribution metadata")
                check(by_id[starter_id]["metadata"].get("license_url") == "https://creativecommons.org/licenses/by/4.0/", f"{starter_id} must link to the CC BY 4.0 license")
            map_svg = client.get(f"/api/maps/{starter_id}/asset/world-india.svg")
            check(map_svg.status_code == 200 and b"<svg" in map_svg.content and b"<path" in map_svg.content, f"{starter_id} editable SVG must be served")
            physical_svg = client.get(f"/api/maps/{starter_id}/asset/physical.svg")
            check(physical_svg.status_code == 200 and b"data:image/png;base64," in physical_svg.content, f"{starter_id} physical relief SVG must be served")
            texture_png = client.get(f"/api/maps/{starter_id}/asset/physical-texture.png")
            check(texture_png.status_code == 200 and texture_png.content.startswith(b"\x89PNG"), f"{starter_id} physical texture PNG must be served")
            thumbnail = client.get(f"/api/maps/{starter_id}/asset/thumbnail.png")
            check(thumbnail.status_code == 200 and thumbnail.content.startswith(b"\x89PNG"), f"{starter_id} thumbnail must be served")
        bundled_asset = client.get("/api/maps/qa-bundled-map/asset/world-india.svg")
        check(bundled_asset.status_code == 200, "Bundled SVG must be readable from the deployment source")
        # Vercel must never silently fall back to temporary map-file writes.
        bundled_upload = client.post(
            "/api/maps/qa-bundled-map/satellite",
            files={"satellite": ("qa.png", tiny_png, "image/png")},
        )
        check(bundled_upload.status_code == 409, "Legacy multipart satellite uploads must be rejected on Vercel")

        uploaded = client.post(
            "/api/maps",
            data={"name": "QA Test Map", "category": "Custom Uploaded Maps"},
            files={"svg": ("qa-map.svg", svg, "image/svg+xml")},
        )
        check(uploaded.status_code == 409, "Legacy multipart SVG uploads must be rejected on Vercel")
        session = client.post(
            "/api/maps/upload-session",
            json={"name": "QA Test Map", "assets": [{"filename": "world-india.svg", "oid": "a" * 64, "size": len(svg)}]},
        )
        check(session.status_code == 503, "Direct LFS upload must require server-side GitHub configuration and upload key")

        saved = client.post(
            "/api/projects",
            json={"name": "QA Project", "map_id": "world-india", "data": {"view": "world", "zoom": 1}},
        )
        check(saved.status_code == 200, f"Project save must succeed: {saved.text}")
        project_id = saved.json()["id"]
        projects = client.get("/api/projects")
        check(projects.status_code == 200 and any(item["id"] == project_id for item in projects.json()), "Saved project must be listed")
        deleted = client.delete(f"/api/projects/{project_id}")
        check(deleted.status_code == 200 and deleted.json().get("ok") is True, "Project delete must succeed")


    print("PASS: Vercel-mode home page, static assets, health, all ten starter-map registrations, SVG/physical/texture/thumbnail asset routes, and project CRUD.")
    print("PASS: Vercel refuses legacy multipart map uploads and refuses direct LFS uploads until server-side GitHub credentials are configured.")
    print("NOTE: This smoke test does not connect to a real GitHub repository; see qa_github_lfs.py for mocked Git LFS route tests.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEMP_DIR.cleanup()
        import shutil
        shutil.rmtree(BUNDLED_FIXTURE, ignore_errors=True)
