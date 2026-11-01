"""Regression test for the same-origin India ADM1 data proxy."""
from __future__ import annotations

import json

from fastapi.testclient import TestClient
import backend.app as api


class FakeResponse:
    def __init__(self, payload: bytes):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, _limit: int = -1) -> bytes:
        return self.payload


def main() -> None:
    features = [
        {
            "type": "Feature",
            "properties": {"shapeName": f"State {index+1}", "shapeISO": f"IN-{index+1:02}"},
            "geometry": {"type": "Polygon", "coordinates": [[[70, 10], [71, 10], [71, 11], [70, 11], [70, 10]]]},
        }
        for index in range(36)
    ]
    payload = json.dumps({"type": "FeatureCollection", "features": features}).encode()
    original = api.urllib.request.urlopen
    try:
        api._INDIA_ADM1_CACHE = None
        api.urllib.request.urlopen = lambda *_args, **_kwargs: FakeResponse(payload)
        with TestClient(api.app) as client:
            response = client.get("/api/boundaries/india-adm1")
            assert response.status_code == 200, response.text
            assert response.headers["content-type"].startswith("application/geo+json")
            assert response.headers["x-mapmotion-boundaries"] == "India-ADM1-36"
            assert len(response.json()["features"]) == 36

        # Regression: a Git LFS pointer is not acceptable boundary geometry.
        api._INDIA_ADM1_CACHE = None
        api.urllib.request.urlopen = lambda *_args, **_kwargs: FakeResponse(
            b"version https://git-lfs.github.com/spec/v1\noid sha256:fake\nsize 5103747\n"
        )
        with TestClient(api.app) as client:
            response = client.get("/api/boundaries/india-adm1")
            assert response.status_code == 502
            assert "Git LFS pointer" in response.json()["detail"]
    finally:
        api.urllib.request.urlopen = original
        api._INDIA_ADM1_CACHE = None
    print("PASS: India ADM1 same-origin proxy validates 36 features, caches valid data, and rejects Git LFS pointers.")


if __name__ == "__main__":
    main()
