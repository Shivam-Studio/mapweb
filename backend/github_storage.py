"""GitHub Git LFS storage helpers for durable MapMotion Studio map assets.

Large bytes move directly from the browser to the temporary LFS upload URL
returned by GitHub. This module only handles small authorization requests,
LFS pointer files, map metadata, and the map catalog through GitHub's APIs.
"""
from __future__ import annotations

import base64
import json
import os
import re
import threading
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class GitHubStorageError(RuntimeError):
    """Raised when GitHub repository or Git LFS storage cannot be used."""


OWNER = os.environ.get("MAPMOTION_GITHUB_OWNER", "").strip()
USERNAME = os.environ.get("MAPMOTION_GITHUB_USERNAME", "").strip()
REPO = os.environ.get("MAPMOTION_GITHUB_REPO", "").strip()
BRANCH = os.environ.get("MAPMOTION_GITHUB_BRANCH", "main").strip() or "main"
TOKEN = os.environ.get("MAPMOTION_GITHUB_TOKEN", "").strip()
UPLOAD_KEY = os.environ.get("MAPMOTION_UPLOAD_KEY", "")
CATALOG_PATH = "storage/maps/user-uploads/catalog.json"
try:
    MAX_FILE_BYTES = int(os.environ.get("MAPMOTION_MAX_LFS_FILE_MB", "2000")) * 1_000_000
except ValueError:
    MAX_FILE_BYTES = 2_000_000_000
MAX_FILE_BYTES = min(max(MAX_FILE_BYTES, 1), 5_000_000_000)

_catalog_lock = threading.RLock()
_catalog_cache: dict[str, Any] | None = None
_catalog_cache_at = 0.0


def is_configured() -> bool:
    return bool(OWNER and USERNAME and REPO and TOKEN and UPLOAD_KEY)


def config_status() -> dict[str, Any]:
    return {
        "configured": is_configured(),
        "provider": "github-lfs" if is_configured() else None,
        "max_file_bytes": MAX_FILE_BYTES,
        "repository": f"{OWNER}/{REPO}" if OWNER and REPO else None,
    }


def require_config() -> None:
    if not is_configured():
        raise GitHubStorageError(
            "GitHub map storage is not configured. Set MAPMOTION_GITHUB_OWNER, MAPMOTION_GITHUB_USERNAME, "
            "MAPMOTION_GITHUB_REPO, MAPMOTION_GITHUB_TOKEN and MAPMOTION_UPLOAD_KEY "
            "in the Vercel project, then redeploy."
        )


def verify_upload_key(value: str | None) -> None:
    require_config()
    if not value or not secrets_equal(value, UPLOAD_KEY):
        raise GitHubStorageError("Invalid map upload key. Ask the MapMotion administrator for the upload key.")


def secrets_equal(a: str, b: str) -> bool:
    # Constant-time comparison without importing an additional dependency.
    import hmac
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _github_api(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    require_config()
    url = f"https://api.github.com/repos/{OWNER}/{REPO}/{path.lstrip('/')}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {TOKEN}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "MapMotion-Studio/0.8.9",
    }
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=25) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else {}
    except HTTPError as exc:
        detail = ""
        try:
            body = exc.read(8192).decode("utf-8", "replace")
            parsed = json.loads(body)
            detail = str(parsed.get("message") or body)
        except Exception:
            detail = str(exc.reason or "GitHub API error")
        raise GitHubStorageError(f"GitHub repository API returned {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        raise GitHubStorageError(f"Could not reach GitHub repository API: {exc}") from exc


def _lfs_batch(operation: str, objects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    require_config()
    auth = base64.b64encode(f"{USERNAME}:{TOKEN}".encode("utf-8")).decode("ascii")
    payload = {
        "operation": operation,
        "transfers": ["basic"],
        "ref": {"name": f"refs/heads/{BRANCH}"},
        "objects": objects,
        "hash_algo": "sha256",
    }
    request = Request(
        f"https://github.com/{OWNER}/{REPO}.git/info/lfs/objects/batch",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Accept": "application/vnd.git-lfs+json",
            "Content-Type": "application/vnd.git-lfs+json",
            "Authorization": f"Basic {auth}",
            "User-Agent": "MapMotion-Studio/0.8.9",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            detail = json.loads(exc.read(8192).decode("utf-8", "replace")).get("message", str(exc.reason))
        except Exception:
            detail = str(exc.reason or "Git LFS error")
        raise GitHubStorageError(f"GitHub Git LFS returned {exc.code}: {detail}") from exc
    except (URLError, TimeoutError, OSError, ValueError) as exc:
        raise GitHubStorageError(f"Could not contact GitHub Git LFS: {exc}") from exc

    returned = result.get("objects")
    if not isinstance(returned, list):
        raise GitHubStorageError("GitHub Git LFS returned an invalid batch response.")
    return returned


def authorize_uploads(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    objects = [{"oid": asset["oid"], "size": asset["size"]} for asset in assets]
    response = _lfs_batch("upload", objects)
    by_oid = {item.get("oid"): item for item in response}
    result: list[dict[str, Any]] = []
    for asset in assets:
        item = by_oid.get(asset["oid"])
        if not item:
            raise GitHubStorageError("GitHub Git LFS did not return an upload status for one of the files.")
        if item.get("error"):
            raise GitHubStorageError(str(item["error"].get("message") or "Git LFS rejected this file."))
        actions = item.get("actions") or {}
        result.append({
            "filename": asset["filename"],
            "oid": asset["oid"],
            "size": asset["size"],
            "already_uploaded": not bool(actions.get("upload")),
            "upload": actions.get("upload"),
            "verify": actions.get("verify"),
        })
    return result


def verify_lfs_objects(assets: list[dict[str, Any]]) -> None:
    response = _lfs_batch(
        "download",
        [{"oid": asset["oid"], "size": asset["size"]} for asset in assets],
    )
    by_oid = {item.get("oid"): item for item in response}
    for asset in assets:
        item = by_oid.get(asset["oid"])
        if not item or item.get("error") or not (item.get("actions") or {}).get("download", {}).get("href"):
            detail = (item or {}).get("error", {}).get("message") or "LFS object is not available yet."
            raise GitHubStorageError(str(detail))


def get_download_action(oid: str, size: int) -> dict[str, Any]:
    response = _lfs_batch("download", [{"oid": oid, "size": size}])
    item = response[0] if response else {}
    if item.get("error"):
        raise GitHubStorageError(str(item["error"].get("message") or "Git LFS download failed."))
    action = (item.get("actions") or {}).get("download")
    if not action or not action.get("href"):
        raise GitHubStorageError("GitHub Git LFS did not return a download URL for this asset.")
    return action


def _contents_path(path: str) -> str:
    return "contents/" + quote(path, safe="/") + "?ref=" + quote(BRANCH, safe="")


def read_repo_file(path: str) -> tuple[bytes, str | None] | None:
    try:
        response = _github_api("GET", _contents_path(path))
    except GitHubStorageError as exc:
        if "returned 404:" in str(exc):
            return None
        raise
    if response.get("type") != "file":
        return None
    encoded = response.get("content") or ""
    try:
        content = base64.b64decode("".join(encoded.split()), validate=False)
    except Exception as exc:
        raise GitHubStorageError(f"Could not decode repository file {path}.") from exc
    return content, response.get("sha")


def write_repo_file(path: str, content: bytes, message: str) -> None:
    current = read_repo_file(path)
    payload: dict[str, Any] = {
        "message": message,
        "content": base64.b64encode(content).decode("ascii"),
        "branch": BRANCH,
    }
    if current and current[1]:
        payload["sha"] = current[1]
    _github_api("PUT", "contents/" + quote(path, safe="/"), payload)


def pointer_content(oid: str, size: int) -> bytes:
    return (
        "version https://git-lfs.github.com/spec/v1\n"
        f"oid sha256:{oid}\n"
        f"size {size}\n"
    ).encode("ascii")


def load_catalog(force: bool = False) -> dict[str, Any]:
    global _catalog_cache, _catalog_cache_at
    require_config()
    with _catalog_lock:
        if not force and _catalog_cache is not None and time.monotonic() - _catalog_cache_at < 5:
            return json.loads(json.dumps(_catalog_cache))
        stored = read_repo_file(CATALOG_PATH)
        if stored is None:
            catalog = {"version": 1, "maps": {}}
        else:
            try:
                catalog = json.loads(stored[0].decode("utf-8"))
            except (UnicodeDecodeError, ValueError) as exc:
                raise GitHubStorageError("The GitHub map catalog is not valid JSON.") from exc
        if not isinstance(catalog.get("maps"), dict):
            catalog["maps"] = {}
        _catalog_cache = catalog
        _catalog_cache_at = time.monotonic()
        return json.loads(json.dumps(catalog))


def save_catalog_record(record: dict[str, Any]) -> None:
    global _catalog_cache, _catalog_cache_at
    require_config()
    with _catalog_lock:
        # Refresh before every write so concurrent writers do not overwrite a
        # catalog version cached by a different Vercel function instance.
        for attempt in range(4):
            stored = read_repo_file(CATALOG_PATH)
            if stored is None:
                catalog = {"version": 1, "maps": {}}
                sha = None
            else:
                try:
                    catalog = json.loads(stored[0].decode("utf-8"))
                except (UnicodeDecodeError, ValueError) as exc:
                    raise GitHubStorageError("The GitHub map catalog is not valid JSON.") from exc
                sha = stored[1]
            if not isinstance(catalog.get("maps"), dict):
                catalog["maps"] = {}
            catalog["maps"][record["id"]] = record
            payload = {
                "message": f"Update MapMotion map catalog: {record['id']}",
                "content": base64.b64encode(
                    json.dumps(catalog, ensure_ascii=False, indent=2).encode("utf-8")
                ).decode("ascii"),
                "branch": BRANCH,
            }
            if sha:
                payload["sha"] = sha
            try:
                _github_api("PUT", "contents/" + quote(CATALOG_PATH, safe="/"), payload)
                _catalog_cache = catalog
                _catalog_cache_at = time.monotonic()
                return
            except GitHubStorageError as exc:
                if attempt == 3 or not any(code in str(exc) for code in ("returned 409:", "returned 422:")):
                    raise
        raise GitHubStorageError("Could not update the GitHub map catalog after several retries.")


def invalidate_catalog_cache() -> None:
    global _catalog_cache, _catalog_cache_at
    with _catalog_lock:
        _catalog_cache = None
        _catalog_cache_at = 0.0


def validate_lfs_asset(asset: dict[str, Any], allowed_names: set[str]) -> dict[str, Any]:
    filename = str(asset.get("filename") or "")
    oid = str(asset.get("oid") or "").lower()
    size = asset.get("size")
    if filename not in allowed_names:
        raise GitHubStorageError("Unsupported map asset filename.")
    if not re.fullmatch(r"[0-9a-f]{64}", oid):
        raise GitHubStorageError("Invalid SHA-256 checksum for map asset.")
    if isinstance(size, bool) or not isinstance(size, int) or size <= 0 or size > MAX_FILE_BYTES:
        raise GitHubStorageError(
            f"Map asset size must be between 1 byte and {MAX_FILE_BYTES // (1024 * 1024)} MB "
            "for the configured GitHub LFS limit."
        )
    return {"filename": filename, "oid": oid, "size": size}


def repo_asset_path(folder: str, filename: str) -> str:
    return f"{folder.rstrip('/')}/{filename}"
