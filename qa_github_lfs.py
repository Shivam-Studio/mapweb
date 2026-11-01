"""Mocked integration tests for the GitHub Git LFS map-upload workflow."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
from unittest.mock import patch

TEMP_DIR = tempfile.TemporaryDirectory(prefix="mapmotion-lfs-qa-")
ROOT = Path(__file__).resolve().parent
os.environ["VERCEL"] = "1"
os.environ["MAPMOTION_DATA_DIR"] = TEMP_DIR.name

from fastapi.testclient import TestClient  # noqa: E402
from backend.app import app  # noqa: E402
from backend import github_storage  # noqa: E402


def main() -> None:
    github_storage.OWNER = "Shivam-Studio"
    github_storage.USERNAME = "qa-user"
    github_storage.REPO = "mapweb"
    github_storage.BRANCH = "main"
    github_storage.TOKEN = "test-token-not-real"
    github_storage.UPLOAD_KEY = "qa-test-upload-key"
    catalog = {"version": 1, "maps": {}}
    written_files: dict[str, bytes] = {}

    def fake_load_catalog(force: bool = False):
        import copy
        return copy.deepcopy(catalog)

    def fake_save_catalog_record(record):
        catalog["maps"][record["id"]] = record

    def fake_authorize(assets):
        return [
            {"filename": asset["filename"], "oid": asset["oid"], "size": asset["size"], "already_uploaded": True, "upload": None, "verify": None}
            for asset in assets
        ]

    def fake_write_repo_file(path, content, message):
        written_files[path] = content

    def fake_download(oid, size):
        return {"href": f"https://lfs.example.test/{oid}"}

    with patch.object(github_storage, "load_catalog", side_effect=fake_load_catalog), \
         patch.object(github_storage, "save_catalog_record", side_effect=fake_save_catalog_record), \
         patch.object(github_storage, "authorize_uploads", side_effect=fake_authorize), \
         patch.object(github_storage, "verify_lfs_objects", return_value=None), \
         patch.object(github_storage, "write_repo_file", side_effect=fake_write_repo_file), \
         patch.object(github_storage, "get_download_action", side_effect=fake_download):
        with TestClient(app) as client:
            svg_oid = "a" * 64
            svg_size = 128
            payload = {
                "name": "QA Git LFS Map",
                "category": "Custom Uploaded Maps",
                "projection": "Test projection",
                "coverage": "QA only",
                "source": "qa-map.svg",
                "path_count": 8,
                "assets": [{"filename": "world-india.svg", "oid": svg_oid, "size": svg_size}],
            }
            denied = client.post("/api/maps/upload-session", json=payload)
            assert denied.status_code == 403, denied.text

            headers = {"X-Map-Upload-Key": "qa-test-upload-key"}
            prepared = client.post("/api/maps/upload-session", json=payload, headers=headers)
            assert prepared.status_code == 200, prepared.text
            map_id = prepared.json()["map_id"]
            assert prepared.json()["uploads"][0]["already_uploaded"] is True

            committed = client.post("/api/maps/commit", json={"map_id": map_id, **payload}, headers=headers)
            assert committed.status_code == 200, committed.text
            assert committed.json()["storage"] == "github-lfs"
            assert catalog["maps"][map_id]["assets"]["world-india.svg"]["oid"] == svg_oid
            pointer_path = f"storage/maps/user-uploads/{map_id}/world-india.svg"
            assert b"version https://git-lfs.github.com/spec/v1" in written_files[pointer_path]

            maps = client.get("/api/maps")
            assert maps.status_code == 200 and any(item["id"] == map_id for item in maps.json())
            asset = client.get(f"/api/maps/{map_id}/asset/world-india.svg", follow_redirects=False)
            assert asset.status_code == 307 and asset.headers["location"] == f"https://lfs.example.test/{svg_oid}"

            # Pair a large satellite image with a bundled starter map. The SVG
            # remains in the bundled tree; only the image pointer is committed.
            image_oid = "b" * 64
            image_asset = {"filename": "satellite.webp", "oid": image_oid, "size": 4096}
            sat_prepared = client.post(
                "/api/maps/world-india/satellite/upload-session",
                json=image_asset,
                headers=headers,
            )
            assert sat_prepared.status_code == 200, sat_prepared.text
            sat_committed = client.post(
                "/api/maps/world-india/satellite/commit",
                json=image_asset,
                headers=headers,
            )
            assert sat_committed.status_code == 200, sat_committed.text
            assert catalog["maps"]["world-india"]["base_map_id"] == "world-india"
            sat_asset = client.get("/api/maps/world-india/asset/satellite.webp", follow_redirects=False)
            assert sat_asset.status_code == 307

            verified = client.post(
                "/api/maps/world-india/verify-pair",
                data={"verified": "true", "notes": "QA alignment", "scale": "100", "x": "0", "y": "0", "opacity": "55"},
                headers=headers,
            )
            assert verified.status_code == 200, verified.text
            assert verified.json()["metadata"]["pairing_status"] == "verified"
            assert verified.json()["metadata"]["alignment_notes"] == "QA alignment"

    print("PASS: GitHub LFS upload authorization, pointer commit, catalog listing, asset redirect, starter-map satellite override, and Git-backed pair metadata.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEMP_DIR.cleanup()
