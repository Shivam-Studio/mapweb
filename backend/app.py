from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os
import sqlite3, json, uuid, shutil, re, mimetypes, xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / 'frontend'
STORAGE = ROOT / 'storage'
MAPS = STORAGE / 'maps'
PROJECTS = STORAGE / 'projects'
def resolve_database_path() -> Path:
    """Keep the live SQLite file out of OneDrive/project extraction folders.

    On Windows, persistent app data lives in %LOCALAPPDATA%\\MapMotionStudio.
    A legacy project-root database is copied with SQLite's backup API on first
    launch; the source is never deleted or overwritten. MAPMOTION_DATA_DIR is
    supported for isolated tests and portable deployments.
    """
    override = os.environ.get('MAPMOTION_DATA_DIR')
    if override:
        data_dir = Path(override).expanduser().resolve()
    elif os.name == 'nt' and os.environ.get('LOCALAPPDATA'):
        data_dir = Path(os.environ['LOCALAPPDATA']) / 'MapMotionStudio'
    else:
        data_dir = ROOT / 'instance'
    data_dir.mkdir(parents=True, exist_ok=True)
    target = data_dir / 'database.sqlite3'
    legacy = ROOT / 'database.sqlite3'
    if not target.exists() and legacy.is_file():
        try:
            source = sqlite3.connect(f'file:{legacy.as_posix()}?mode=ro', uri=True, timeout=15)
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
            raise RuntimeError(f'Could not safely migrate the existing MapMotion Studio database from {legacy}: {exc}') from exc
    return target


DB = resolve_database_path()
for p in (MAPS, PROJECTS): p.mkdir(parents=True, exist_ok=True)
app = FastAPI(title='MapMotion Studio API', version='0.8.0')


def db():
    con = sqlite3.connect(DB, timeout=15)
    con.execute('PRAGMA busy_timeout=15000')
    con.row_factory = sqlite3.Row
    return con


def init_db():
    with db() as con:
        con.execute('''CREATE TABLE IF NOT EXISTS maps (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
            folder TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
        con.execute('''CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, map_id TEXT NOT NULL,
            data TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)''')
        # Register every bundled map asset from its own metadata. This is important
        # for fresh installs: the ESRI world map must not disappear merely because it
        # was added after the original two India-view maps.
        for folder in sorted(MAPS.iterdir()):
            metadata_path = folder / 'metadata.json'
            svg_path = folder / 'world-india.svg'
            if not folder.is_dir() or not metadata_path.is_file() or not svg_path.is_file():
                continue
            try:
                metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
                map_id = str(metadata.get('id') or folder.name)
                name = str(metadata.get('name') or folder.name)
                category = str(metadata.get('category') or 'Custom Uploaded Maps')
            except (OSError, ValueError, TypeError):
                continue
            con.execute('INSERT OR IGNORE INTO maps(id,name,category,folder,metadata) VALUES(?,?,?,?,?)',
                (map_id, name, category, folder.name, json.dumps(metadata, ensure_ascii=False)))

init_db()


def safe_name(name: str) -> str:
    name = re.sub(r'[^a-zA-Z0-9_-]+', '-', name.strip()).strip('-').lower()
    return name[:60] or 'map'



def validate_raster(data: bytes, ext: str):
    valid = (data.startswith(b'\x89PNG\r\n\x1a\n') if ext == '.png' else
             data.startswith(b'\xff\xd8\xff') if ext in {'.jpg','.jpeg'} else
             (len(data) >= 12 and data[:4] == b'RIFF' and data[8:12] == b'WEBP'))
    if not valid: raise HTTPException(400, 'Uploaded image content does not match its file type')

def map_row(row):
    d = dict(row); d['metadata'] = json.loads(d['metadata']); return d

@app.get('/api/health')
def health(): return {'ok': True, 'product': 'MapMotion Studio', 'version': '0.8.0'}

@app.get('/api/maps')
def list_maps():
    with db() as con: rows = con.execute('SELECT * FROM maps ORDER BY created_at DESC').fetchall()
    return [map_row(r) for r in rows]

@app.get('/api/maps/{map_id}/asset/{asset_name}')
def map_asset(map_id: str, asset_name: str):
    if asset_name not in {'world-india.svg','source-original.svg','physical.svg','physical-texture.png','thumbnail.png','satellite.png','satellite.jpg','satellite.webp'}:
        raise HTTPException(404, 'Asset not found')
    with db() as con: row = con.execute('SELECT folder FROM maps WHERE id=?',(map_id,)).fetchone()
    if not row: raise HTTPException(404, 'Map not found')
    path = (MAPS / row['folder'] / asset_name).resolve()
    if MAPS.resolve() not in path.parents or not path.is_file(): raise HTTPException(404,'Asset not found')
    return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream')

@app.post('/api/maps')
async def create_map(name: str = Form(...), category: str = Form('Custom Uploaded Maps'), projection: str = Form('Unknown'), coverage: str = Form('Unknown'), svg: UploadFile = File(...), satellite: UploadFile | None = File(None)):
    if not (svg.filename or '').lower().endswith('.svg'): raise HTTPException(400,'Map boundary file must be SVG')
    name = (name or '').strip()[:120]
    if not name: raise HTTPException(400,'Map name is required')
    raw = await svg.read()
    if len(raw) > 30*1024*1024: raise HTTPException(413,'SVG exceeds 30 MB')
    try: text = raw.decode('utf-8-sig')
    except UnicodeDecodeError: raise HTTPException(400,'SVG must be UTF-8 encoded')
    if '<script' in text.lower() or '<foreignobject' in text.lower() or re.search(r'\son[a-z]+\s*=', text, re.I): raise HTTPException(400,'SVG contains unsafe active content')
    try: root=ET.fromstring(text)
    except ET.ParseError: raise HTTPException(400,'SVG XML is malformed')
    if root.tag.split('}')[-1].lower() != 'svg': raise HTTPException(400,'Uploaded XML root must be an SVG element')
    for el in root.iter():
        if el.tag.split('}')[-1].lower() in {'script','foreignobject'}: raise HTTPException(400,'SVG contains unsupported active content')
        for key,val in el.attrib.items():
            if key.lower().endswith('href') and val and not val.startswith(('data:image/','#')):
                raise HTTPException(400,'External SVG references are not accepted; embed assets locally first')
            if key.lower() == 'style' and re.search(r'url\(\s*["\']?(?:https?:|//|file:|javascript:)', val, re.I):
                raise HTTPException(400,'External SVG style references are not accepted')
    sat_name = None; satellite_data = None
    if satellite and satellite.filename:
        ext = Path(satellite.filename).suffix.lower()
        if ext not in {'.png','.jpg','.jpeg','.webp'}: raise HTTPException(400,'Satellite image must be PNG, JPG or WebP')
        sat_name = 'satellite' + ('.jpg' if ext == '.jpeg' else ext)
        satellite_data = await satellite.read()
        if len(satellite_data) > 80*1024*1024: raise HTTPException(413,'Satellite image exceeds 80 MB')
        validate_raster(satellite_data, ext)
    map_id = safe_name(name) + '-' + uuid.uuid4().hex[:6]
    folder = MAPS / map_id; folder.mkdir(parents=True)
    (folder/'world-india.svg').write_bytes(raw)
    if satellite_data is not None: (folder/sat_name).write_bytes(satellite_data)
    path_count = len(re.findall(r'<(?:path|polygon|rect|circle)\b', text, re.I))
    metadata = {'id':map_id,'name':name,'category':category,'projection':projection,'coverage':coverage,'svg':'world-india.svg','satellite':sat_name,'thumbnail':None,'source':svg.filename,'license':'Not specified — admin review required','pairing_status':'unverified' if sat_name else 'unpaired','path_count':path_count}
    (folder/'metadata.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
    with db() as con: con.execute('INSERT INTO maps(id,name,category,folder,metadata) VALUES(?,?,?,?,?)',(map_id,name,category,map_id,json.dumps(metadata)))
    return {'ok':True,'map':metadata}

@app.post('/api/maps/{map_id}/satellite')
async def upload_satellite(map_id: str, satellite: UploadFile = File(...)):
    ext = Path(satellite.filename or '').suffix.lower()
    if ext not in {'.png','.jpg','.jpeg','.webp'}: raise HTTPException(400,'Satellite image must be PNG, JPG or WebP')
    data = await satellite.read()
    if len(data) > 80*1024*1024: raise HTTPException(413,'Satellite image exceeds 80 MB')
    validate_raster(data, ext)
    with db() as con:
        row=con.execute('SELECT * FROM maps WHERE id=?',(map_id,)).fetchone()
        if not row: raise HTTPException(404,'Map not found')
        folder=MAPS/row['folder']; old=json.loads(row['metadata'])
        filename='satellite' + ('.jpg' if ext == '.jpeg' else ext)
        for oldfile in folder.glob('satellite.*'):
            if oldfile.is_file(): oldfile.unlink()
        (folder/filename).write_bytes(data)
        old['satellite']=filename; old['pairing_status']='unverified'
        (folder/'metadata.json').write_text(json.dumps(old,indent=2),encoding='utf-8')
        con.execute('UPDATE maps SET metadata=? WHERE id=?',(json.dumps(old),map_id))
    return {'ok':True,'metadata':old}

@app.post('/api/maps/{map_id}/verify-pair')
def verify_pair(map_id: str, verified: bool = Form(...), notes: str = Form(''), scale: float = Form(100), x: float = Form(0), y: float = Form(0), opacity: float = Form(55)):
    with db() as con:
        row=con.execute('SELECT * FROM maps WHERE id=?',(map_id,)).fetchone()
        if not row: raise HTTPException(404,'Map not found')
        m=json.loads(row['metadata'])
        if not m.get('satellite'): raise HTTPException(400,'Upload a satellite image before verifying alignment')
        m['pairing_status']='verified' if verified else 'unverified'; m['alignment_notes']=notes
        if not (10 <= scale <= 300 and -2000 <= x <= 2000 and -2000 <= y <= 2000 and 0 <= opacity <= 100): raise HTTPException(400,'Alignment values are outside supported limits')
        m['alignment']={'scale':scale,'x':x,'y':y,'opacity':opacity}
        con.execute('UPDATE maps SET metadata=? WHERE id=?',(json.dumps(m),map_id))
        (MAPS/row['folder']/'metadata.json').write_text(json.dumps(m,indent=2),encoding='utf-8')
    return {'ok':True,'metadata':m}

@app.get('/api/projects')
def list_projects():
    with db() as con: rows=con.execute('SELECT * FROM projects ORDER BY updated_at DESC').fetchall()
    return [{'id':r['id'],'name':r['name'],'map_id':r['map_id'],'data':json.loads(r['data']),'updated_at':r['updated_at']} for r in rows]

@app.post('/api/projects')
def save_project(payload: dict):
    project_id=payload.get('id') or uuid.uuid4().hex[:12]
    name=str(payload.get('name') or 'Untitled map project')[:120]
    map_id=str(payload.get('map_id') or 'world-india')
    data=payload.get('data') or {}
    with db() as con:
        if not con.execute('SELECT 1 FROM maps WHERE id=?',(map_id,)).fetchone(): raise HTTPException(404,'Map not found')
        con.execute('''INSERT INTO projects(id,name,map_id,data,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name,map_id=excluded.map_id,data=excluded.data,updated_at=CURRENT_TIMESTAMP''',
          (project_id,name,map_id,json.dumps(data)))
    return {'ok':True,'id':project_id,'name':name,'map_id':map_id}

@app.delete('/api/projects/{project_id}')
def delete_project(project_id: str):
    with db() as con: cur=con.execute('DELETE FROM projects WHERE id=?',(project_id,))
    if not cur.rowcount: raise HTTPException(404,'Project not found')
    return {'ok':True}

app.mount('/assets', StaticFiles(directory=FRONTEND), name='assets')
@app.get('/')
def home(): return FileResponse(FRONTEND/'index.html')
