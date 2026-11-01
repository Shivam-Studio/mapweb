"""MapMotion Studio FastAPI backend (local Windows + Vercel preview runtime).

Local Windows mode keeps user uploads in the project storage folder and the
SQLite database under %LOCALAPPDATA% so a running DB is not overwritten by ZIP
updates. On Vercel, writable files are redirected to /tmp because the function
filesystem is otherwise read-only. Vercel /tmp is ephemeral; this is a preview
compatibility mode, not durable cloud storage.
"""

from __future__ import annotations

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
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
import uuid
import xml.etree.ElementTree as ET

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

app = FastAPI(title="MapMotion Studio API", version="0.8.3")


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

    In Vercel mode bundled maps are read-only. An edit/upload operation first
    copies that map folder into the writable /tmp maps root.
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
    return {
        "ok": True,
        "product": "MapMotion Studio",
        "version": "0.8.3",
        "runtime": "vercel" if IS_VERCEL else "local",
        "storage_mode": "ephemeral" if IS_VERCEL else "local-persistent",
        "persistent_storage_configured": not IS_VERCEL,
        "warning": (
            "Vercel preview storage uses temporary /tmp files. Map uploads and saved projects "
            "are not durable across function restarts or instances. Configure persistent "
            "database and object storage before production use."
            if IS_VERCEL
            else None
        ),
    }


@app.get("/api/maps")
def list_maps() -> list[dict]:
    with db() as connection:
        rows = connection.execute("SELECT * FROM maps ORDER BY created_at DESC").fetchall()
    return [map_row(row) for row in rows]


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


@app.post("/api/maps")
async def create_map(
    name: str = Form(...),
    category: str = Form("Custom Uploaded Maps"),
    projection: str = Form("Unknown"),
    coverage: str = Form("Unknown"),
    svg: UploadFile = File(...),
    satellite: UploadFile | None = File(None),
):
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
):
    with db() as connection:
        row = connection.execute("SELECT * FROM maps WHERE id=?", (map_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Map not found")
        metadata = json.loads(row["metadata"])
        if not metadata.get("satellite"):
            raise HTTPException(400, "Upload a satellite image before verifying alignment")
        if not (10 <= scale <= 300 and -2000 <= x <= 2000 and -2000 <= y <= 2000 and 0 <= opacity <= 100):
            raise HTTPException(400, "Alignment values are outside supported limits")
        folder = resolve_map_folder(row["folder"], writable=True)
        if folder is None:
            raise HTTPException(404, "Map storage folder not found")
        metadata["pairing_status"] = "verified" if verified else "unverified"
        metadata["alignment_notes"] = notes
        metadata["alignment"] = {"scale": scale, "x": x, "y": y, "opacity": opacity}
        connection.execute(
            "UPDATE maps SET metadata=? WHERE id=?", (json.dumps(metadata), map_id)
        )
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
