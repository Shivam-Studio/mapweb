"""MapMotion Studio FastAPI backend (local Windows + Vercel runtime).

Local Windows mode keeps local uploads under storage/maps and SQLite under
%LOCALAPPDATA%. On Vercel, bundled starter maps remain read-only and uploaded
map assets are transferred directly from the browser to GitHub Git LFS. Only
small LFS pointers and map metadata are committed through the Vercel API. Saved
SQLite projects remain temporary on Vercel in this release.
"""

from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from contextlib import contextmanager
from typing import Iterator
import json
import mimetypes
import os
import re
import shutil
import sqlite3
import time
import uuid
import xml.etree.ElementTree as ET

from . import github_storage

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
IS_VERCEL = os.environ.get("VERCEL", "").lower() in {"1", "true", "yes"}
DATA_DIR_OVERRIDE = os.environ.get("MAPMOTION_DATA_DIR")


def resolve_data_dir() -> Path:
    if DATA_DIR_OVERRIDE:
        return Path(DATA_DIR_OVERRIDE).expanduser().resolve()
    if IS_VERCEL:
        return Path("/tmp/MapMotionStudio")
    if os.name == "nt" and os.environ.get("LOCALAPPDATA"):
        return Path(os.environ["LOCALAPPDATA"]) / "MapMotionStudio"
    return ROOT / "instance"


RUNTIME_DATA_DIR = resolve_data_dir()
if IS_VERCEL:
    # Read-only deployment assets stay under ROOT/storage/maps. New uploads,
    # writable copies of bundled maps, projects and SQLite go into /tmp.
    STORAGE = RUNTIME_DATA_DIR
    MAPS = STORAGE / "maps"
    PROJECTS = STORAGE / "projects"
    BUNDLED_MAPS = ROOT / "storage" / "maps"
else:
    STORAGE = ROOT / "storage"
    MAPS = STORAGE / "maps"
    PROJECTS = STORAGE / "projects"
    BUNDLED_MAPS = MAPS


def resolve_database_path() -> Path:
    """Create a safe local/Vercel SQLite path; migrate legacy Windows DB once."""
    data_dir = RUNTIME_DATA_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    target = data_dir / "database.sqlite3"

    # Never try to migrate a project-root database into a Vercel function.
    if not IS_VERCEL:
        legacy = ROOT / "database.sqlite3"
        if not target.exists() and legacy.is_file():
            try:
                source = sqlite3.connect(
                    f"file:{legacy.as_posix()}?mode=ro", uri=True, timeout=15
                )
                destination = sqlite3.connect(target, timeout=15)
                try:
                    source.backup(destination)
                    destination.commit()
                finally:
                    source.close()
                    destination.close()
            except sqlite3.Error as exc:
                try:
                    target.unlink(missing_ok=True)
                except OSError:
                    pass
                raise RuntimeError(
                    f"Could not safely migrate the existing MapMotion Studio database: {exc}"
                ) from exc
    return target


DB = resolve_database_path()
for directory in (MAPS, PROJECTS):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="MapMotion Studio API", version="0.8.4")


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    """Open a short-lived SQLite connection and always close its file handle."""
    connection = sqlite3.connect(DB, timeout=15)
    connection.execute("PRAGMA busy_timeout=15000")
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def resolve_map_folder(folder_name: str, *, writable: bool = False) -> Path | None:
    """Resolve a map folder safely from writable or bundled map roots.

    Bundled map folders are read-only on Vercel. This helper is used only by
    local file-backed uploads and legacy local pairing operations.
    """
    if not folder_name or folder_name in {".", ".."} or "/" in folder_name or "\\" in folder_name:
        return None

    writable_path = (MAPS / folder_name).resolve()
    if MAPS.resolve() not in writable_path.parents:
        return None

    if writable:
        if writable_path.is_dir():
            return writable_path
        bundled_path = (BUNDLED_MAPS / folder_name).resolve()
        if BUNDLED_MAPS.resolve() in bundled_path.parents and bundled_path.is_dir():
            if bundled_path != writable_path:
                shutil.copytree(bundled_path, writable_path)
            return writable_path
        return None

    for base in (MAPS, BUNDLED_MAPS):
        safe_base = base.resolve()
        candidate = (base / folder_name).resolve()
        if safe_base in candidate.parents and candidate.is_dir():
            return candidate
    return None


def init_db() -> None:
    with db() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS maps (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                folder TEXT NOT NULL,
                metadata TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                map_id TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
        )

        seen: set[Path] = set()
        for root in (BUNDLED_MAPS, MAPS):
            resolved_root = root.resolve()
            if resolved_root in seen or not root.is_dir():
                continue
            seen.add(resolved_root)
            for folder in sorted(root.iterdir()):
                metadata_path = folder / "metadata.json"
                svg_path = folder / "world-india.svg"
                if not folder.is_dir() or not metadata_path.is_file() or not svg_path.is_file():
                    continue
                try:
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    map_id = str(metadata.get("id") or folder.name)
                    name = str(metadata.get("name") or folder.name)
                    category = str(metadata.get("category") or "Custom Uploaded Maps")
                except (OSError, ValueError, TypeError):
                    continue
                connection.execute(
                    "INSERT OR IGNORE INTO maps(id,name,category,folder,metadata) VALUES(?,?,?,?,?)",
                    (map_id, name, category, folder.name, json.dumps(metadata, ensure_ascii=False)),
                )


init_db()


def safe_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip()).strip("-").lower()
    return cleaned[:60] or "map"


def validate_raster(data: bytes, extension: str) -> None:
    valid = (
        data.startswith(b"\x89PNG\r\n\x1a\n")
        if extension == ".png"
        else data.startswith(b"\xff\xd8\xff")
        if extension in {".jpg", ".jpeg"}
        else len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    )
    if not valid:
        raise HTTPException(400, "Uploaded image content does not match its file type")


def map_row(row: sqlite3.Row) -> dict:
    result = dict(row)
    result["metadata"] = json.loads(result["metadata"])
    return result


@app.get("/api/health")
def health() -> dict:
    github_status = github_storage.config_status()
    map_storage_mode = "github-lfs" if github_status["configured"] else ("ephemeral" if IS_VERCEL else "local-persistent")
    return {
        "ok": True,
        "product": "MapMotion Studio",
        "version": "0.8.4",
        "runtime": "vercel" if IS_VERCEL else "local",
        "storage_mode": map_storage_mode,
        "map_storage_mode": map_storage_mode,
        "projects_storage_mode": "ephemeral" if IS_VERCEL else "local-persistent",
        "persistent_storage_configured": bool(github_status["configured"] or not IS_VERCEL),
        "github_lfs": github_status,
        "warning": (
            "Map assets use GitHub Git LFS. Saved projects still use temporary Vercel SQLite storage."
            if IS_VERCEL and github_status["configured"]
            else "Map upload is disabled until GitHub Git LFS is configured. Vercel /tmp is temporary."
            if IS_VERCEL
            else None
        ),
    }


@app.get("/api/maps")
def list_maps() -> list[dict]:
    with db() as connection:
        rows = connection.execute("SELECT * FROM maps ORDER BY created_at DESC").fetchall()
    result = [map_row(row) for row in rows]
    if github_storage.is_configured():
        try:
            catalog = github_storage.load_catalog()
        except github_storage.GitHubStorageError as exc:
            raise HTTPException(502, str(exc)) from exc
        existing = {item["id"]: index for index, item in enumerate(result)}
        for map_id, record in catalog.get("maps", {}).items():
            item = {
                "id": map_id,
                "name": record.get("name") or map_id,
                "category": record.get("category") or "Custom Uploaded Maps",
                "folder": record.get("folder") or "",
                "metadata": record.get("metadata") or {},
                "created_at": record.get("created_at") or "",
            }
            if map_id in existing:
                result[existing[map_id]]["metadata"] = item["metadata"]
                result[existing[map_id]]["name"] = item["name"]
                result[existing[map_id]]["category"] = item["category"]
            else:
                result.insert(0, item)
    return result


@app.get("/api/maps/{map_id}/asset/{asset_name}")
def map_asset(map_id: str, asset_name: str):
    allowed_assets = {
        "world-india.svg",
        "source-original.svg",
        "physical.svg",
        "physical-texture.png",
        "thumbnail.png",
        "satellite.png",
        "satellite.jpg",
        "satellite.webp",
    }
    if asset_name not in allowed_assets:
        raise HTTPException(404, "Asset not found")

    # User-uploaded assets are Git LFS objects. Redirect the browser to the
    # short-lived download URL so large files never pass through Vercel.
    if github_storage.is_configured():
        try:
            record = github_storage.load_catalog().get("maps", {}).get(map_id)
            asset = (record or {}).get("assets", {}).get(asset_name)
            if asset:
                action = github_storage.get_download_action(asset["oid"], int(asset["size"]))
                return RedirectResponse(action["href"], status_code=307)
        except github_storage.GitHubStorageError as exc:
            raise HTTPException(502, str(exc)) from exc

    with db() as connection:
        row = connection.execute("SELECT folder FROM maps WHERE id=?", (map_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Map not found")
    folder = resolve_map_folder(row["folder"])
    if folder is None:
        raise HTTPException(404, "Asset not found")
    path = (folder / asset_name).resolve()
    if folder.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "Asset not found")
    return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")


def _github_error(exc: Exception) -> HTTPException:
    return HTTPException(503, str(exc))


def _check_map_upload_key(value: str | None) -> None:
    if not github_storage.is_configured():
        raise HTTPException(503, "GitHub Git LFS is not configured. Add the required Vercel environment variables and redeploy.")
    try:
        github_storage.verify_upload_key(value)
    except github_storage.GitHubStorageError as exc:
        raise HTTPException(403, str(exc)) from exc


def _map_id_is_safe(map_id: str) -> bool:
    return bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]{2,90}", map_id or ""))


def _base_map_record(map_id: str) -> dict | None:
    with db() as connection:
        row = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
    if not row:
        return None
    base = map_row(row)
    return {
        "id": map_id,
        "name": base["name"],
        "category": base["category"],
        "folder": f"storage/maps/user-uploads/_overrides/{map_id}",
        "base_map_id": map_id,
        "metadata": base["metadata"],
        "assets": {},
        "created_at": base.get("created_at") or "",
    }


@app.post("/api/maps/upload-session")
def prepare_github_map_upload(payload: dict, x_map_upload_key: str | None = Header(None)) -> dict:
    """Authorize direct browser-to-Git-LFS uploads for a new map."""
    _check_map_upload_key(x_map_upload_key)
    name = str(payload.get("name") or "").strip()[:120]
    if not name:
        raise HTTPException(400, "Map name is required")
    raw_assets = payload.get("assets")
    if not isinstance(raw_assets, list) or not raw_assets or len(raw_assets) > 2:
        raise HTTPException(400, "Select an SVG and optionally one satellite image")
    try:
        assets = [github_storage.validate_lfs_asset(item, {"world-india.svg", "satellite.png", "satellite.jpg", "satellite.webp"}) for item in raw_assets]
        if sum(1 for item in assets if item["filename"] == "world-india.svg") != 1:
            raise github_storage.GitHubStorageError("Exactly one world-india.svg boundary asset is required.")
        if len({item["filename"] for item in assets}) != len(assets):
            raise github_storage.GitHubStorageError("Duplicate asset names were submitted.")
        uploads = github_storage.authorize_uploads(assets)
    except github_storage.GitHubStorageError as exc:
        raise HTTPException(400, str(exc)) from exc

    map_id = safe_name(name) + "-" + uuid.uuid4().hex[:8]
    return {
        "ok": True,
        "map_id": map_id,
        "uploads": uploads,
        "max_file_bytes": github_storage.MAX_FILE_BYTES,
        "storage": "github-lfs-direct",
    }


@app.post("/api/maps/commit")
def commit_github_map_upload(payload: dict, x_map_upload_key: str | None = Header(None)) -> dict:
    """Commit only small Git LFS pointers and metadata to the configured branch."""
    _check_map_upload_key(x_map_upload_key)
    map_id = str(payload.get("map_id") or "")
    if not _map_id_is_safe(map_id):
        raise HTTPException(400, "Invalid map upload session")
    name = str(payload.get("name") or "").strip()[:120]
    if not name:
        raise HTTPException(400, "Map name is required")
    raw_assets = payload.get("assets")
    if not isinstance(raw_assets, list) or not raw_assets or len(raw_assets) > 2:
        raise HTTPException(400, "Map upload is missing its asset manifest")
    try:
        assets = [github_storage.validate_lfs_asset(item, {"world-india.svg", "satellite.png", "satellite.jpg", "satellite.webp"}) for item in raw_assets]
        if sum(1 for item in assets if item["filename"] == "world-india.svg") != 1:
            raise github_storage.GitHubStorageError("Exactly one world-india.svg boundary asset is required.")
        if len({item["filename"] for item in assets}) != len(assets):
            raise github_storage.GitHubStorageError("Duplicate asset names were submitted.")
        github_storage.verify_lfs_objects(assets)
        folder = f"storage/maps/user-uploads/{map_id}"
        asset_index = {}
        for asset in assets:
            path = github_storage.repo_asset_path(folder, asset["filename"])
            pointer = github_storage.pointer_content(asset["oid"], asset["size"])
            github_storage.write_repo_file(path, pointer, f"Add MapMotion LFS asset: {map_id}/{asset['filename']}")
            asset_index[asset["filename"]] = {"oid": asset["oid"], "size": asset["size"], "path": path}
        satellite_name = next((item["filename"] for item in assets if item["filename"].startswith("satellite.")), None)
        metadata = {
            "id": map_id,
            "name": name,
            "category": str(payload.get("category") or "Custom Uploaded Maps")[:80],
            "projection": str(payload.get("projection") or "Unknown")[:120],
            "coverage": str(payload.get("coverage") or "Unknown")[:180],
            "svg": "world-india.svg",
            "satellite": satellite_name,
            "thumbnail": None,
            "source": str(payload.get("source") or "uploaded-map.svg")[:180],
            "license": "Not specified — admin review required",
            "pairing_status": "unverified" if satellite_name else "unpaired",
            "path_count": max(0, min(int(payload.get("path_count") or 0), 1000000)),
            "storage_backend": "github-lfs",
        }
        record = {
            "id": map_id,
            "name": name,
            "category": metadata["category"],
            "folder": folder,
            "metadata": metadata,
            "assets": asset_index,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        metadata_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")
        github_storage.write_repo_file(f"{folder}/metadata.json", metadata_bytes, f"Add MapMotion map metadata: {map_id}")
        github_storage.save_catalog_record(record)
    except (github_storage.GitHubStorageError, ValueError, TypeError) as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "map": metadata, "storage": "github-lfs"}


@app.post("/api/maps/{map_id}/satellite/upload-session")
def prepare_github_satellite_upload(map_id: str, payload: dict, x_map_upload_key: str | None = Header(None)) -> dict:
    _check_map_upload_key(x_map_upload_key)
    if not _map_id_is_safe(map_id):
        raise HTTPException(400, "Invalid map ID")
    raw_asset = dict(payload or {})
    filename = str(raw_asset.get("filename") or "")
    if filename.endswith(".jpeg"):
        filename = "satellite.jpg"
    raw_asset["filename"] = filename
    try:
        asset = github_storage.validate_lfs_asset(raw_asset, {"satellite.png", "satellite.jpg", "satellite.webp"})
        catalog = github_storage.load_catalog(force=True)
        record = catalog.get("maps", {}).get(map_id) or _base_map_record(map_id)
        if not record:
            raise HTTPException(404, "Map not found")
        upload = github_storage.authorize_uploads([asset])[0]
    except github_storage.GitHubStorageError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"ok": True, "map_id": map_id, "upload": upload, "max_file_bytes": github_storage.MAX_FILE_BYTES}


@app.post("/api/maps/{map_id}/satellite/commit")
def commit_github_satellite_upload(map_id: str, payload: dict, x_map_upload_key: str | None = Header(None)) -> dict:
    _check_map_upload_key(x_map_upload_key)
    if not _map_id_is_safe(map_id):
        raise HTTPException(400, "Invalid map ID")
    try:
        asset = github_storage.validate_lfs_asset(payload or {}, {"satellite.png", "satellite.jpg", "satellite.webp"})
        github_storage.verify_lfs_objects([asset])
        catalog = github_storage.load_catalog(force=True)
        record = catalog.get("maps", {}).get(map_id) or _base_map_record(map_id)
        if not record:
            raise HTTPException(404, "Map not found")
        folder = record["folder"]
        path = github_storage.repo_asset_path(folder, asset["filename"])
        github_storage.write_repo_file(path, github_storage.pointer_content(asset["oid"], asset["size"]), f"Add MapMotion satellite LFS asset: {map_id}")
        record.setdefault("assets", {})[asset["filename"]] = {"oid": asset["oid"], "size": asset["size"], "path": path}
        for key in list(record["assets"]):
            if key.startswith("satellite.") and key != asset["filename"]:
                del record["assets"][key]
        metadata = record.get("metadata") or {}
        metadata["satellite"] = asset["filename"]
        metadata["pairing_status"] = "unverified"
        metadata["storage_backend"] = "github-lfs"
        record["metadata"] = metadata
        github_storage.write_repo_file(f"{folder}/metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"), f"Update MapMotion map metadata: {map_id}")
        github_storage.save_catalog_record(record)
    except (github_storage.GitHubStorageError, ValueError, TypeError) as exc:
        raise HTTPException(502, str(exc)) from exc
    return {"ok": True, "metadata": metadata, "storage": "github-lfs"}


@app.post("/api/maps")
async def create_map(
    name: str = Form(...),
    category: str = Form("Custom Uploaded Maps"),
    projection: str = Form("Unknown"),
    coverage: str = Form("Unknown"),
    svg: UploadFile = File(...),
    satellite: UploadFile | None = File(None),
):
    if IS_VERCEL:
        raise HTTPException(409, "Vercel uploads must use the Git LFS direct-upload workflow. Open the updated MapMotion Studio release.")
    if not (svg.filename or "").lower().endswith(".svg"):
        raise HTTPException(400, "Map boundary file must be SVG")
    name = (name or "").strip()[:120]
    if not name:
        raise HTTPException(400, "Map name is required")
    raw = await svg.read()
    if len(raw) > 30 * 1024 * 1024:
        raise HTTPException(413, "SVG exceeds 30 MB")
    try:
        svg_text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "SVG must be UTF-8 encoded") from exc
    if (
        "<script" in svg_text.lower()
        or "<foreignobject" in svg_text.lower()
        or re.search(r"\son[a-z]+\s*=", svg_text, re.I)
    ):
        raise HTTPException(400, "SVG contains unsafe active content")
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as exc:
        raise HTTPException(400, "SVG XML is malformed") from exc
    if root.tag.split("}")[-1].lower() != "svg":
        raise HTTPException(400, "Uploaded XML root must be an SVG element")
    for element in root.iter():
        if element.tag.split("}")[-1].lower() in {"script", "foreignobject"}:
            raise HTTPException(400, "SVG contains unsupported active content")
        for key, value in element.attrib.items():
            if key.lower().endswith("href") and value and not value.startswith(("data:image/", "#")):
                raise HTTPException(400, "External SVG references are not accepted; embed assets locally first")
            if key.lower() == "style" and re.search(
                r"url\(\s*[\"']?(?:https?:|//|file:|javascript:)", value, re.I
            ):
                raise HTTPException(400, "External SVG style references are not accepted")

    satellite_name = None
    satellite_data = None
    if satellite and satellite.filename:
        extension = Path(satellite.filename).suffix.lower()
        if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
            raise HTTPException(400, "Satellite image must be PNG, JPG or WebP")
        satellite_name = "satellite" + (".jpg" if extension == ".jpeg" else extension)
        satellite_data = await satellite.read()
        if len(satellite_data) > 80 * 1024 * 1024:
            raise HTTPException(413, "Satellite image exceeds 80 MB")
        validate_raster(satellite_data, extension)

    map_id = safe_name(name) + "-" + uuid.uuid4().hex[:6]
    folder = MAPS / map_id
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "world-india.svg").write_bytes(raw)
    if satellite_data is not None and satellite_name:
        (folder / satellite_name).write_bytes(satellite_data)
    path_count = len(re.findall(r"<(?:path|polygon|rect|circle)\b", svg_text, re.I))
    metadata = {
        "id": map_id,
        "name": name,
        "category": category,
        "projection": projection,
        "coverage": coverage,
        "svg": "world-india.svg",
        "satellite": satellite_name,
        "thumbnail": None,
        "source": svg.filename,
        "license": "Not specified — admin review required",
        "pairing_status": "unverified" if satellite_name else "unpaired",
        "path_count": path_count,
    }
    (folder / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    with db() as connection:
        connection.execute(
            "INSERT INTO maps(id,name,category,folder,metadata) VALUES(?,?,?,?,?)",
            (map_id, name, category, map_id, json.dumps(metadata)),
        )
    return {"ok": True, "map": metadata}


@app.post("/api/maps/{map_id}/satellite")
async def upload_satellite(map_id: str, satellite: UploadFile = File(...)):
    if IS_VERCEL:
        raise HTTPException(409, "Vercel satellite uploads must use the Git LFS direct-upload workflow. Open the updated MapMotion Studio release.")
    extension = Path(satellite.filename or "").suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(400, "Satellite image must be PNG, JPG or WebP")
    data = await satellite.read()
    if len(data) > 80 * 1024 * 1024:
        raise HTTPException(413, "Satellite image exceeds 80 MB")
    validate_raster(data, extension)

    with db() as connection:
        row = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Map not found")
        folder = resolve_map_folder(row["folder"], writable=True)
        if folder is None:
            raise HTTPException(404, "Map storage folder not found")
        old = json.loads(row["metadata"])
        filename = "satellite" + (".jpg" if extension == ".jpeg" else extension)
        for old_file in folder.glob("satellite.*"):
            if old_file.is_file():
                old_file.unlink()
        (folder / filename).write_bytes(data)
        old["satellite"] = filename
        old["pairing_status"] = "unverified"
        (folder / "metadata.json").write_text(json.dumps(old, indent=2), encoding="utf-8")
        connection.execute("UPDATE maps SET metadata=? WHERE id=?", (json.dumps(old), map_id))
    return {"ok": True, "metadata": old}


@app.post("/api/maps/{map_id}/verify-pair")
def verify_pair(
    map_id: str,
    verified: bool = Form(...),
    notes: str = Form(""),
    scale: float = Form(100),
    x: float = Form(0),
    y: float = Form(0),
    opacity: float = Form(55),
    x_map_upload_key: str | None = Header(None),
):
    if not (10 <= scale <= 300 and -2000 <= x <= 2000 and -2000 <= y <= 2000 and 0 <= opacity <= 100):
        raise HTTPException(400, "Alignment values are outside supported limits")

    if github_storage.is_configured():
        _check_map_upload_key(x_map_upload_key)
        try:
            catalog = github_storage.load_catalog(force=True)
            record = catalog.get("maps", {}).get(map_id) or _base_map_record(map_id)
            if not record:
                raise HTTPException(404, "Map not found")
            metadata = record.get("metadata") or {}
            if not metadata.get("satellite"):
                raise HTTPException(400, "Upload a satellite image before verifying alignment")
            metadata["pairing_status"] = "verified" if verified else "unverified"
            metadata["alignment_notes"] = notes[:4000]
            metadata["alignment"] = {"scale": scale, "x": x, "y": y, "opacity": opacity}
            metadata["storage_backend"] = "github-lfs"
            record["metadata"] = metadata
            folder = record["folder"]
            github_storage.write_repo_file(f"{folder}/metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8"), f"Update MapMotion pairing metadata: {map_id}")
            github_storage.save_catalog_record(record)
        except github_storage.GitHubStorageError as exc:
            raise HTTPException(502, str(exc)) from exc
        return {"ok": True, "metadata": metadata, "storage": "github-lfs"}

    if IS_VERCEL:
        raise HTTPException(503, "GitHub Git LFS is not configured. Map metadata cannot be saved durably.")
    with db() as connection:
        row = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Map not found")
        metadata = json.loads(row["metadata"])
        if not metadata.get("satellite"):
            raise HTTPException(400, "Upload a satellite image before verifying alignment")
        folder = resolve_map_folder(row["folder"], writable=True)
        if folder is None:
            raise HTTPException(404, "Map storage folder not found")
        metadata["pairing_status"] = "verified" if verified else "unverified"
        metadata["alignment_notes"] = notes[:4000]
        metadata["alignment"] = {"scale": scale, "x": x, "y": y, "opacity": opacity}
        connection.execute("UPDATE maps SET metadata=? WHERE id=?", (json.dumps(metadata), map_id))
        (folder / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return {"ok": True, "metadata": metadata}


@app.get("/api/projects")
def list_projects() -> list[dict]:
    with db() as connection:
        rows = connection.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "map_id": row["map_id"],
            "data": json.loads(row["data"]),
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


@app.post("/api/projects")
def save_project(payload: dict) -> dict:
    project_id = payload.get("id") or uuid.uuid4().hex[:12]
    name = str(payload.get("name") or "Untitled map project")[:120]
    map_id = str(payload.get("map_id") or "world-india")
    data = payload.get("data") or {}
    with db() as connection:
        if not connection.execute("SELECT 1 FROM maps WHERE id=?", (map_id,)).fetchone():
            raise HTTPException(404, "Map not found")
        connection.execute(
            """INSERT INTO projects(id,name,map_id,data,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,map_id=excluded.map_id,
            data=excluded.data,updated_at=CURRENT_TIMESTAMP""",
            (project_id, name, map_id, json.dumps(data)),
        )
    return {"ok": True, "id": project_id, "name": name, "map_id": map_id}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    with db() as connection:
        cursor = connection.execute("DELETE FROM projects WHERE id=?", (project_id,))
    if not cursor.rowcount:
        raise HTTPException(404, "Project not found")
    return {"ok": True}


app.mount("/assets", StaticFiles(directory=FRONTEND), name="assets")


@app.get("/")
def home():
    return FileResponse(FRONTEND / "index.html")
