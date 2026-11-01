const $ = id => document.getElementById(id);
const state = {maps:[], mapId:'', metadata:null, svgText:'', sourceSvg:null, paths:[], selected:new Set(), view:'world', style:'political', projectId:null, loadedSvgMapId:null, imageUrl:null, imageFile:null, physicalSvgData:null, physicalTextureData:null, alignment:{opacity:55,scale:100,x:0,y:0}, zoom:1,panX:0,panY:0,drag:null,selectionMode:'single',baseViewBox:null,customViewSource:null,isolated:false,showPhysicalLayer:true,showCountryLayer:true};
const api = async (url, options={}) => { const r=await fetch(url,options); let d={}; try{d=await r.json()}catch{} if(!r.ok) throw new Error(d.detail||`Request failed (${r.status})`); return d; };
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}
function page(name, options={}){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${name}`));document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));$('pageTitle').textContent=({dashboard:'Dashboard',library:'Map Library',editor:'Map Editor',pairing:'Image Pairing',projects:'Saved Projects'})[name]||'MapMotion Studio';if(options.load===false)return;if(name==='library')renderLibrary();if(name==='editor'&&(options.reload||state.loadedSvgMapId!==state.mapId||!$('liveMap')))loadEditor().catch(e=>toast(`Could not load editor: ${e.message}`));if(name==='pairing')renderPairing().catch(e=>toast(`Could not load pairing: ${e.message}`));if(name==='projects')loadProjects().catch(e=>toast(`Could not load projects: ${e.message}`));}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>page(b.dataset.page)));
let isVercelPreview=false;
let isGithubLfsStorage=false;
let maxLfsFileBytes=2*1024*1024*1024;
let mapUploadKey='';
async function init(){try{
  const health=await api('/api/health');
  isVercelPreview=health.runtime==='vercel';
  isGithubLfsStorage=health.map_storage_mode==='github-lfs';
  maxLfsFileBytes=Number(health.github_lfs?.max_file_bytes)||maxLfsFileBytes;
  const chip=document.querySelector('.status-chip');
  if(chip){
    if(isGithubLfsStorage){chip.textContent='Git-backed map storage';chip.classList.add('connected');}
    else if(health.storage_mode==='ephemeral'){chip.textContent='Preview · maps not configured';chip.classList.add('connected','temporary');}
    else{chip.innerHTML='<i></i> API connected';chip.classList.add('connected');}
  }
  const deploymentWarning=$('deploymentWarning');
  if(deploymentWarning&&isVercelPreview&&!isGithubLfsStorage){deploymentWarning.hidden=false;deploymentWarning.textContent='GitHub Git LFS is not configured. Map uploads are disabled on this deployment; configure the GitHub storage environment variables before uploading.';}
  const projectNote=$('projectsStorageNote');
  if(projectNote){
    projectNote.textContent=health.projects_storage_mode==='ephemeral'
      ?'Map assets are stored in GitHub LFS. Saved projects still use temporary Vercel SQLite storage and may disappear after a function restart.'
      :'Projects are stored in the local SQLite database on this computer.';
  }
  const uploadNote=$('deploymentUploadNote');
  if(uploadNote){
    uploadNote.hidden=!(isVercelPreview||isGithubLfsStorage);
    uploadNote.textContent=isGithubLfsStorage
      ?`Git-backed storage: map files upload directly from your browser to GitHub LFS, not through Vercel. Per-file limit for this configuration: ${formatBytes(maxLfsFileBytes)}. GitHub plan quotas still apply.`
      :'Map uploads are unavailable until GitHub Git LFS storage is configured in Vercel.';
  }
  const satelliteNote=$('satelliteUploadNote');
  if(satelliteNote&&isGithubLfsStorage)satelliteNote.textContent=`GitHub LFS direct upload · max ${formatBytes(maxLfsFileBytes)} per file`;
  if(satelliteNote&&isVercelPreview&&!isGithubLfsStorage)satelliteNote.textContent='GitHub Git LFS storage is not configured; uploads are disabled.';
  await refreshMaps();
}catch(e){const chip=document.querySelector('.status-chip');if(chip){chip.textContent='API disconnected';chip.classList.add('disconnected')}const count=$('mapCount');if(count)count.textContent='API unavailable';const featured=$('featuredMap');if(featured)featured.innerHTML='<div class="panel empty-library"><b>MapMotion API is not connected</b><p>This deployment must run the FastAPI application from the repository root. Reconnect the Vercel project to Shivam-Studio/mapweb and set Root Directory to ./.</p></div>';const grid=$('mapGrid');if(grid)grid.innerHTML='<div class="panel empty-library"><b>Map library unavailable</b><p>Waiting for the FastAPI backend.</p></div>';const canvas=$('mapCanvas');if(canvas)canvas.innerHTML='<div class="map-loading">Backend unavailable. This is not a frontend-only deployment; open the repository root as a FastAPI project.</div>';toast(`API unavailable: ${e.message}. Check the Vercel FastAPI deployment.`);}}
function formatBytes(bytes){if(!Number.isFinite(bytes)||bytes<=0)return 'unknown';const units=['B','KB','MB','GB'];let n=bytes,u=0;while(n>=1024&&u<units.length-1){n/=1024;u++;}return `${n.toFixed(u===0?0:1)} ${units[u]}`;}
function requireMapUploadKey(){if(mapUploadKey)return mapUploadKey;const value=window.prompt('Enter the MapMotion Git upload key provided by the administrator:');if(!value)throw new Error('Upload cancelled: Git upload key is required.');mapUploadKey=value;return mapUploadKey;}
async function githubUploadApi(url,payload){const key=requireMapUploadKey();return api(url,{method:'POST',headers:{'Content-Type':'application/json','X-Map-Upload-Key':key},body:JSON.stringify(payload)});}
async function hashBrowserFile(file){
  if(!window.MapMotionSha256)throw new Error('The secure file-hashing module did not load. Refresh the page and try again.');
  const hash=new window.MapMotionSha256();
  const chunkSize=4*1024*1024;
  for(let offset=0;offset<file.size;offset+=chunkSize){
    const chunk=await file.slice(offset,Math.min(file.size,offset+chunkSize)).arrayBuffer();
    hash.update(new Uint8Array(chunk));
    if(file.size>chunkSize)toast(`Preparing ${file.name}: ${Math.min(100,Math.round((offset+chunk.byteLength)/file.size*100))}%`);
  }
  return hash.hex();
}
async function validateSvgUpload(file){
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.svg'))throw new Error('Map boundary file must be an SVG.');
  if(file.size<=0||file.size>maxLfsFileBytes)throw new Error(`SVG size must be between 1 byte and ${formatBytes(maxLfsFileBytes)}.`);
  const text=await file.text();
  const doc=new DOMParser().parseFromString(text,'image/svg+xml');
  const root=doc.documentElement;
  if(!root||root.localName.toLowerCase()!=='svg'||doc.querySelector('parsererror'))throw new Error('SVG XML is malformed or its root element is not <svg>.');
  for(const element of doc.querySelectorAll('*')){
    const tag=element.localName.toLowerCase();
    if(tag==='script'||tag==='foreignobject')throw new Error('SVG contains unsupported active content.');
    for(const attribute of [...element.attributes]){
      const key=attribute.name.toLowerCase(),value=attribute.value||'';
      if(/^on[a-z]+$/.test(key))throw new Error('SVG contains an event-handler attribute.');
      if(key.endsWith('href')&&value&&!value.startsWith('data:image/')&&!value.startsWith('#'))throw new Error('External SVG references are not accepted; embed linked assets first.');
      if(key==='style'&&/url\(\s*["']?(?:https?:|\/\/|file:|javascript:)/i.test(value))throw new Error('SVG contains an external style reference.');
    }
  }
  return {text,pathCount:(text.match(/<(?:path|polygon|rect|circle)\b/gi)||[]).length};
}
async function validateRasterUpload(file){
  if(!(file instanceof File)||file.size<=0||file.size>maxLfsFileBytes)throw new Error(`Image size must be between 1 byte and ${formatBytes(maxLfsFileBytes)}.`);
  const ext=file.name.toLowerCase().split('.').pop();
  if(!['png','jpg','jpeg','webp'].includes(ext))throw new Error('Satellite image must be PNG, JPG or WebP.');
  const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
  const png=head.length>=8&&head[0]===0x89&&head[1]===0x50&&head[2]===0x4e&&head[3]===0x47&&head[4]===0x0d&&head[5]===0x0a&&head[6]===0x1a&&head[7]===0x0a;
  const jpg=head.length>=3&&head[0]===0xff&&head[1]===0xd8&&head[2]===0xff;
  const webp=head.length>=12&&String.fromCharCode(...head.slice(0,4))==='RIFF'&&String.fromCharCode(...head.slice(8,12))==='WEBP';
  if(!(ext==='png'?png:ext==='jpg'||ext==='jpeg'?jpg:webp))throw new Error('Image content does not match its file extension.');
  return ext==='jpeg'?'jpg':ext;
}
function putFileToLfs(file,action){
  if(!action?.href)return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open('PUT',action.href,true);
    Object.entries(action.header||{}).forEach(([key,value])=>xhr.setRequestHeader(key,value));
    xhr.upload.onprogress=event=>{if(event.lengthComputable)toast(`Uploading ${file.name}: ${Math.round(event.loaded/event.total*100)}%`);};
    xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300)resolve();else reject(new Error(`GitHub LFS upload failed (${xhr.status}): ${xhr.responseText||'Upload rejected'}`));};
    xhr.onerror=()=>reject(new Error('Could not reach GitHub LFS upload storage. Check the connection or browser CORS/network restrictions and retry.'));
    xhr.ontimeout=()=>reject(new Error('GitHub LFS upload timed out. Retry the upload.'));
    xhr.timeout=0;
    xhr.send(file);
  });
}
async function verifyLfsUpload(verify,oid,size){
  if(!verify?.href)return;
  const headers={Accept:'application/vnd.git-lfs+json','Content-Type':'application/vnd.git-lfs+json',...(verify.header||{})};
  const response=await fetch(verify.href,{method:'POST',headers,body:JSON.stringify({oid,size})});
  if(!response.ok)throw new Error(`GitHub LFS could not verify the uploaded object (${response.status}).`);
}
async function uploadNewMapToGithub(formData){
  const svgFile=formData.get('svg');
  const satelliteFile=formData.get('satellite');
  const svgCheck=await validateSvgUpload(svgFile);
  const fileItems=[{file:svgFile,filename:'world-india.svg'}];
  let satelliteExtension=null;
  if(satelliteFile instanceof File&&satelliteFile.size>0){satelliteExtension=await validateRasterUpload(satelliteFile);fileItems.push({file:satelliteFile,filename:`satellite.${satelliteExtension}`});}
  const assets=[];
  for(const item of fileItems){const oid=await hashBrowserFile(item.file);assets.push({filename:item.filename,oid,size:item.file.size});}
  const metadata={name:String(formData.get('name')||''),category:String(formData.get('category')||'Custom Uploaded Maps'),projection:String(formData.get('projection')||'Unknown'),coverage:String(formData.get('coverage')||'Unknown'),source:svgFile.name,path_count:svgCheck.pathCount,assets};
  const session=await githubUploadApi('/api/maps/upload-session',metadata);
  for(const item of session.uploads){const source=fileItems.find(entry=>entry.filename===item.filename);if(!source)throw new Error(`Upload manifest mismatch for ${item.filename}.`);if(!item.already_uploaded){toast(`Uploading ${source.file.name} to GitHub LFS…`);await putFileToLfs(source.file,item.upload);await verifyLfsUpload(item.verify,item.oid,item.size);}}
  toast('Committing map pointers and metadata to GitHub…');
  return githubUploadApi('/api/maps/commit',{map_id:session.map_id,...metadata});
}
async function uploadSatelliteToGithub(mapId,file){
  const extension=await validateRasterUpload(file);
  const asset={filename:`satellite.${extension}`,size:file.size,oid:await hashBrowserFile(file)};
  const session=await githubUploadApi(`/api/maps/${encodeURIComponent(mapId)}/satellite/upload-session`,asset);
  if(!session.upload.already_uploaded){toast(`Uploading ${file.name} to GitHub LFS…`);await putFileToLfs(file,session.upload.upload);await verifyLfsUpload(session.upload.verify,asset.oid,asset.size);}
  toast('Saving satellite image pointer in GitHub…');
  return githubUploadApi(`/api/maps/${encodeURIComponent(mapId)}/satellite/commit`,asset);
}
function preferredMapId(){return state.maps.find(m=>m.id==='world-map-6c3644')?.id||state.maps.find(m=>m.id==='world-india')?.id||state.maps[0]?.id||''}
function preferredViewForMap(id){return state.maps.find(m=>m.id===id)?.metadata?.recommended_view||'world'}
async function refreshMaps(){state.maps=await api('/api/maps');if(!state.mapId||!state.maps.some(m=>m.id===state.mapId))state.mapId=preferredMapId();$('mapCount').textContent=`${state.maps.length} map asset${state.maps.length===1?'':'s'}`;const ws=document.querySelector('.sidebar-bottom small');if(ws)ws.textContent=`${state.maps.filter(m=>m.metadata?.starter_asset).length} starter maps · hosted workspace`;renderFeatured();renderLibrary();fillEditorMap();if(!state.mapId){$('canvasTitle').textContent='No map loaded';$('selectionCount').textContent='Upload an SVG to begin';$('sourceCount').textContent='0 paths';$('mapCanvas').innerHTML='<div class="map-loading">No map assets are bundled in this deployment. Open Map Library → Upload map to add an SVG you own or are licensed to use.</div>';}}
function renderFeatured(){const m=state.maps.find(x=>x.id==='world-map-6c3644')||state.maps.find(x=>x.id==='world-india')||state.maps[0];if(!m){$('featuredMap').innerHTML='<div class="panel empty-library"><b>No map assets bundled</b><p>Upload an SVG map you have permission to use from Map Library to begin.</p><button class="button small" onclick="page(&quot;library&quot;)">Open Map Library →</button></div>';return;}$('featuredMap').innerHTML=`<img src="/api/maps/${m.id}/asset/${m.metadata.thumbnail||'world-india.svg'}" onerror="this.style.display='none'" alt=""><div><b>${esc(m.name)}</b><small>${esc(m.metadata.coverage||'')} · ${m.metadata.path_count||'—'} editable regions · ${esc(m.metadata.pairing_status)}</small>${m.metadata.source_credit?'<small class="source-credit"><a href="https://www.amcharts.com/svg-maps/world/" target="_blank" rel="noopener noreferrer">Map by amCharts</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></small>':''}<button class="button small" style="margin-top:10px" onclick="openMap('${m.id}')">Open in editor →</button></div>`;}
function renderLibrary(){const q=($('mapSearch')?.value||'').toLowerCase(),cat=$('categoryFilter')?.value||'all';const items=state.maps.filter(m=>(cat==='all'||m.category===cat)&&(`${m.name} ${m.category} ${m.metadata.coverage||''}`).toLowerCase().includes(q));$('mapGrid').innerHTML=items.length?items.map(m=>`<article class="map-card" onclick="openMap('${m.id}')"><div class="map-thumb"><img src="/api/maps/${m.id}/asset/${m.metadata.thumbnail||'world-india.svg'}" onerror="this.style.display='none'" alt=""></div><b>${esc(m.name)}</b><small>${esc(m.metadata.coverage||'Coverage not specified')}</small><span class="tag">${esc(m.category)}</span> <span class="tag">${esc(m.metadata.pairing_status||'unpaired')}</span> ${m.metadata.starter_asset?'<span class="tag">Starter map</span>':''} ${m.metadata.physical_svg?'<span class="tag">Physical SVG included</span>':''}${m.metadata.source_credit?'<small class="source-credit"><a href="https://www.amcharts.com/svg-maps/world/" target="_blank" rel="noopener noreferrer">Map by amCharts</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></small>':'<small class="source-credit">User-provided map</small>'}</article>`).join(''):'<div class="panel">No maps match this search. Upload an SVG map to add one.</div>'; }
$('mapSearch').addEventListener('input',renderLibrary);$('categoryFilter').addEventListener('change',renderLibrary);
window.openMap=async id=>{if(!state.maps.some(x=>x.id===id))return toast('That map is no longer available. Refresh the library.');state.mapId=id;state.selected.clear();state.customViewBox=null;state.customViewSource=null;state.isolated=false;state.showPhysicalLayer=true;state.showCountryLayer=true;state.zoom=1;state.panX=0;state.panY=0;state.projectId=null;state.projectName=null;state.view=preferredViewForMap(id);$('countrySearch').value='';page('editor',{reload:true});};
function fillEditorMap(){$('editorMap').innerHTML=state.maps.length?state.maps.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join(''):'<option value="">Upload a map first</option>';$('editorMap').value=state.mapId||'';}
$('editorMap').addEventListener('change',async e=>{state.mapId=e.target.value;state.selected.clear();state.customViewBox=null;state.customViewSource=null;state.isolated=false;state.showPhysicalLayer=true;state.showCountryLayer=true;state.view=preferredViewForMap(state.mapId);state.zoom=1;state.panX=0;state.panY=0;await loadEditor()});
function extractEmbeddedPhysicalTexture(svgText){
  try{
    const doc=new DOMParser().parseFromString(String(svgText||''),'image/svg+xml');
    if(doc.querySelector('parsererror'))return null;
    const image=doc.querySelector('image');
    const href=image?.getAttribute('href')||image?.getAttributeNS('http://www.w3.org/1999/xlink','href')||image?.getAttribute('xlink:href')||'';
    return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(href)?href:null;
  }catch{return null}
}
async function loadEditor(){const m=state.maps.find(x=>x.id===state.mapId);if(!m){state.mapId='';state.metadata=null;state.svgText='';state.sourceSvg=null;state.paths=[];state.selected.clear();state.loadedSvgMapId=null;$('editorMap').value='';$('canvasTitle').textContent='No map loaded';$('selectionCount').textContent='Upload an SVG to begin';$('mapCanvas').innerHTML='<div class="map-loading empty-map-state"><b>No map loaded yet</b><span>Open Map Library and upload a licensed SVG boundary file to start editing.</span><button class="button small" onclick="page(&quot;library&quot;)">Open Map Library →</button></div>';$('sourceCount').textContent='0 selectable regions';$('selectionCountPanel').textContent='0 selected';$('selectedList').innerHTML='<div class="selection-empty">Upload a map to select countries.</div>';return;}state.metadata=m.metadata;state.style=m.metadata.map_type==='physical'?'physical':'political';$('showPhysicalLayer').checked=state.showPhysicalLayer;$('showCountryLayer').checked=state.showCountryLayer;$('autoFitCountry').checked=false;$('editorMap').value=state.mapId;$('canvasTitle').textContent=m.name;const res=await fetch(`/api/maps/${state.mapId}/asset/world-india.svg`);if(!res.ok){$('mapCanvas').innerHTML='<div class=\"map-loading\">SVG asset missing.</div>';return;}state.svgText=await res.text();state.loadedSvgMapId=state.mapId;try{if(m.metadata.physical_svg){const pr=await fetch(`/api/maps/${state.mapId}/asset/${m.metadata.physical_svg}`);if(pr.ok){const pb=await pr.blob();const physicalText=await pb.text();state.physicalTextureData=extractEmbeddedPhysicalTexture(physicalText);state.physicalSvgData=await new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(pb)})}else{state.physicalSvgData=null;state.physicalTextureData=null}}else{state.physicalSvgData=null;state.physicalTextureData=null}}catch{state.physicalSvgData=null;state.physicalTextureData=null}const hasPhysicalAsset=!!state.physicalSvgData;const physicalOption=[...$('styleSelect').options].find(o=>o.value==='physical');if(physicalOption){physicalOption.disabled=!hasPhysicalAsset;physicalOption.title=hasPhysicalAsset?'':'This map has no physical terrain SVG.';}$('showPhysicalLayer').disabled=!hasPhysicalAsset;$('showPhysicalLayer').title=hasPhysicalAsset?'':'This map has no physical terrain asset.';if(!hasPhysicalAsset){state.showPhysicalLayer=false;$('showPhysicalLayer').checked=false;}if(state.style==='physical'&&!hasPhysicalAsset){state.style='political';toast('This map has no physical terrain asset; switched to Political style.')}const doc=new DOMParser().parseFromString(state.svgText,'image/svg+xml');if(doc.querySelector('parsererror')){state.paths=[];$('mapCanvas').innerHTML='<div class="map-loading">This SVG is malformed or could not be parsed. Re-upload a valid SVG file.</div>';toast('Could not parse this SVG file.');return;}state.sourceSvg=doc.documentElement;const svg=$('mapCanvas').querySelector('svg');const clone=state.sourceSvg.cloneNode(true);clone.id='liveMap';clone.removeAttribute('width');clone.removeAttribute('height');clone.style.width='100%';clone.style.height='100%';clone.setAttribute('preserveAspectRatio','xMidYMid meet');const paths=[...clone.querySelectorAll('path,polygon,rect,circle')].filter(el=>{const tag=el.tagName.toLowerCase();if(el.closest('defs,clipPath,mask,pattern,marker,symbol'))return false;const identified=['data-code','data-country-id','data-name','data-country-name','id','title','aria-label'].some(a=>el.hasAttribute(a));return tag==='path'||tag==='polygon'||identified;});state.selected=new Set();state.paths=paths;state.baseViewBox=clone.getAttribute('viewBox')||'0 0 1000 600';state.isolated=false;state.selected=new Set([...state.selected].filter(i=>Number.isInteger(i)&&i>=0&&i<paths.length));paths.forEach((p,i)=>{p.classList.add('country');p.dataset.index=i;p.dataset.code=p.getAttribute('data-code')||p.getAttribute('data-country-id')||p.id||'';p.dataset.name=featureName(p,i);p.dataset.basefill=p.getAttribute('fill')||'#9aaab7';p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('pointer-events','all');p.setAttribute('aria-label',p.dataset.name);const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=p.dataset.name;p.appendChild(title);p.addEventListener('click',e=>{e.stopPropagation();selectFeature(i);});p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFeature(i)}});});$('mapCanvas').innerHTML='';$('mapCanvas').appendChild(clone);state.zoom=1;state.panX=0;state.panY=0;applyView();applyStyle();updateSelection();$('sourceCount').textContent=`${paths.length} selectable regions`;$('styleSelect').value=state.style;$('viewSelect').value=state.view;}
const CONTINENT_CODES={
  'north-america':'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI UM-DQ UM-FQ UM-HQ UM-JQ UM-MQ UM-WQ'.split(' '),
  'south-america':'AR BO BR BV CL CO EC FK GF GS GY PE PY SR UY VE'.split(' '),
  'europe':'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GE GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK TR'.split(' '),
  'africa':'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GO GQ GW JU KE KM LS LR LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TF TG TN TZ UG YT ZA ZM ZW'.split(' '),
  'asia':'AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IO IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA RU SA SG SY TH TJ TL TM TR TW UZ VN YE'.split(' '),
  'oceania':'AS AU CC CK CX FJ FM GU HM KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS'.split(' '),
  'antarctica':['AQ']
};
const CONTINENT_FRAME_EXCLUSIONS={
  // Remote US minor outlying islands sit around the Pacific dateline and would
  // make the North America frame span almost the entire world.
  'north-america':new Set(['UM-DQ','UM-FQ','UM-HQ','UM-JQ','UM-MQ','UM-WQ']),
  europe:new Set(['RU']),
  asia:new Set(['RU']),
  // Kiribati is split across the map's dateline and French Polynesia is at the
  // opposite map edge; including both in one rectangle would collapse Oceania
  // back to a near-world view. Their boundaries remain in the source SVG.
  oceania:new Set(['KI','PF','CK','PN'])
};
let cameraPreviewFrame=0;
let cameraViewPreviewUrl=null;
let countryPreviewUrl=null;
let positionedPreviewUrl=null;
let positionedPreviewJob=0;
function featureCode(feature){return String(feature.dataset.code||feature.getAttribute('data-country-id')||feature.id||'').toUpperCase()}
function formatViewBox(x,y,w,h){return `${x} ${y} ${w} ${h}`}
function continentBounds(key){
  const codes=new Set(CONTINENT_CODES[key]||[]);
  const exclusions=CONTINENT_FRAME_EXCLUSIONS[key]||new Set();
  const features=state.paths.filter(p=>codes.has(featureCode(p))&&!exclusions.has(featureCode(p)));
  if(key==='antarctica'&&!features.length){
    const base=(state.baseViewBox||'0 0 1000 600').trim().split(/[ ,]+/).map(Number);
    if(base.length===4&&base.every(Number.isFinite)&&base[2]>0&&base[3]>0){
      // The current supplied ESRI world raster reaches Antarctica along its southern edge,
      // but its SVG boundary layer has no AQ polygon. Frame that southern raster extent
      // without inventing a country outline.
      state.antarcticaRasterOnly=true;
      const [x,y,w,h]=base;
      return formatViewBox(x,y+h*.72,w,h*.28);
    }
    return null;
  }
  if(!features.length)return null;
  state.antarcticaRasterOnly=false;
  const boxes=features.map(feature=>featureBoundsInRoot(feature)).filter(b=>[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.width>=0&&b.height>=0);
  if(!boxes.length)return null;
  let x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  let right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
  let w=right-x,h=bottom-y;
  if(!(w>0&&h>0))return null;
  const pad=Math.max(w,h)*.08;x-=pad;y-=pad;w+=pad*2;h+=pad*2;
  // Expand (never crop) to the editor canvas aspect, so the continent uses the
  // available viewport without distorting the source projection.
  const canvas=$('mapCanvas'),aspect=(canvas?.clientWidth||800)/(canvas?.clientHeight||500);
  if(w/h<aspect){const nw=h*aspect;x-=(nw-w)/2;w=nw}else{const nh=w/aspect;y-=(nh-h)/2;h=nh}
  return formatViewBox(x,y,w,h);
}
function scheduleCameraViewPreview(){
  if(!document.getElementById('cameraViewPreview')||!$('liveMap')||cameraPreviewFrame)return;
  cameraPreviewFrame=requestAnimationFrame(()=>{cameraPreviewFrame=0;updateCameraViewPreview();updatePositionedCountryPreview()});
}
function applyView(){
  const svg=$('liveMap');if(!svg)return;
  const base=state.baseViewBox||state.sourceSvg?.getAttribute('viewBox')||'0 0 1000 600';
  let preset=null;state.antarcticaRasterOnly=false;
  if(state.view==='india'){
    const india=state.paths.find(p=>featureCode(p)==='IN');
    if(india){try{const b=featureBoundsInRoot(india);const pad=Math.max(b.width,b.height)*1.05;preset=formatViewBox(b.x-pad,b.y-pad,b.width+pad*2,b.height+pad*2)}catch{}}
  }else if(CONTINENT_CODES[state.view])preset=continentBounds(state.view);
  if(state.view==='antarctica'&&state.antarcticaRasterOnly)toast('This SVG has no Antarctica vector boundary; showing the southern raster extent only.');
  if((state.view==='india'||CONTINENT_CODES[state.view])&&!preset)toast(`This map does not contain enough geometry to frame ${state.view.replace('-',' ')}.`);
  svg.setAttribute('viewBox',state.customViewBox||(preset||base));
  const viewSelect=$('viewSelect');
  if(viewSelect){let customOption=[...viewSelect.options].find(o=>o.value==='custom-camera');if(state.customViewBox){if(!customOption){customOption=document.createElement('option');customOption.value='custom-camera';customOption.textContent='Custom camera';customOption.disabled=true;viewSelect.appendChild(customOption)}viewSelect.value='custom-camera'}else{customOption?.remove();viewSelect.value=state.view;}}
  svg.style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;
  svg.style.transformOrigin='50% 50%';
  scheduleCameraViewPreview();
}
// Pure camera-to-map conversion. The editor applies CSS
// transform: translate(panX, panY) scale(zoom) around the SVG centre.
// Convert the four clipped canvas corners back through that exact transform,
// then through SVG preserveAspectRatio="xMidYMid meet" letterboxing.
// This intentionally does not depend on getScreenCTM(), whose treatment of
// CSS transforms differs between browser engines and can return the source
// map frame instead of the active continent camera.
function cameraViewBoxFromState(viewBox,canvasWidth,canvasHeight,zoom,panX,panY){
  const vb=String(viewBox||'0 0 1000 600').trim().split(/[ ,]+/).map(Number);
  if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)return null;
  const cw=Number(canvasWidth),ch=Number(canvasHeight),z=Number(zoom);
  if(!(cw>0&&ch>0&&z>0&&Number.isFinite(z)))return null;
  const [vx,vy,vw,vh]=vb;
  const fit=Math.min(cw/vw,ch/vh);
  if(!(fit>0&&Number.isFinite(fit)))return null;
  const offsetX=(cw-vw*fit)/2,offsetY=(ch-vh*fit)/2;
  const px=Number.isFinite(Number(panX))?Number(panX):0;
  const py=Number.isFinite(Number(panY))?Number(panY):0;
  const mapPoint=(screenX,screenY)=>{
    // Invert CSS transform around 50% 50%, including pan in CSS pixels.
    const localX=(screenX-cw/2-px)/z+cw/2;
    const localY=(screenY-ch/2-py)/z+ch/2;
    return {x:vx+(localX-offsetX)/fit,y:vy+(localY-offsetY)/fit};
  };
  const points=[[0,0],[cw,0],[cw,ch],[0,ch]].map(([x,y])=>mapPoint(x,y));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  const x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
  return [x,y,w,h].every(Number.isFinite)&&w>0&&h>0?formatViewBox(x,y,w,h):null;
}
function editorCameraViewBox(){
  const svg=$('liveMap'),canvas=$('mapCanvas');
  if(!svg||!canvas)return state.baseViewBox||'0 0 1000 600';
  const result=cameraViewBoxFromState(
    svg.getAttribute('viewBox')||state.baseViewBox||'0 0 1000 600',
    canvas.clientWidth||800,canvas.clientHeight||500,
    state.zoom,state.panX,state.panY
  );
  return result||svg.getAttribute('viewBox')||state.baseViewBox||'0 0 1000 600';
}
function zoomAround(nextZoom,clientX=null,clientY=null){
  const canvas=$('mapCanvas'),rect=canvas.getBoundingClientRect();
  const px=clientX==null?rect.width/2:clientX-rect.left,py=clientY==null?rect.height/2:clientY-rect.top;
  const cx=rect.width/2,cy=rect.height/2,old=state.zoom;
  const next=Math.max(.15,Math.min(12,nextZoom));if(Math.abs(next-old)<1e-6)return;
  const ratio=next/old;if(state.customViewSource==='auto-fit')state.customViewSource='manual';
  // Keep the geographic point under the pointer fixed while zooming.
  state.panX=ratio*state.panX+(1-ratio)*(px-cx);
  state.panY=ratio*state.panY+(1-ratio)*(py-cy);
  state.zoom=next;applyView();
}
function applyStyle(){const svg=$('liveMap');if(!svg)return;if(state.style==='physical'&&!state.physicalSvgData){state.style='political';if($('styleSelect'))$('styleSelect').value='political';toast('This map has no physical terrain asset; switched to Political style.')} $('mapCanvas').className='map-canvas '+state.style+(state.showCountryLayer?'':' country-layer-hidden');svg.querySelector('#physicalTerrainLayer')?.remove();if(state.style==='physical'&&state.physicalSvgData){const vb=(state.baseViewBox||svg.getAttribute('viewBox')||'0 0 1000 600').trim().split(/[ ,]+/).map(Number);const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.id='physicalTerrainLayer';image.setAttribute('href',state.physicalTextureData||state.physicalSvgData);image.setAttribute('x',vb[0]);image.setAttribute('y',vb[1]);image.setAttribute('width',vb[2]);image.setAttribute('height',vb[3]);image.setAttribute('preserveAspectRatio','none');image.setAttribute('pointer-events','none');image.style.display=state.showPhysicalLayer?'':'none';svg.insertBefore(image,svg.firstChild);}state.paths.forEach((p,i)=>{if(!p.dataset.customfill)p.setAttribute('fill',state.style==='blank'?'#f0f3f5':state.style==='physical'?'transparent':state.style==='satellite'?'#344b48':p.dataset.basefill);p.setAttribute('stroke',p.dataset.customstroke|| (state.style==='blank'?'#778493':state.style==='physical'?'#465c4b':state.style==='satellite'?'#c9b997':'#dce4ec'));p.setAttribute('stroke-width',$('strokeWidth').value);p.setAttribute('stroke-opacity',state.showCountryLayer?'1':'0');p.setAttribute('fill-opacity',state.showCountryLayer?'1':'0');p.setAttribute('pointer-events','all');});updateSelection();}
$('viewSelect').addEventListener('change',e=>{if(e.target.value==='custom-camera'){e.target.value=state.customViewBox?'custom-camera':state.view;return}state.view=e.target.value;state.customViewBox=null;state.customViewSource=null;state.zoom=1;state.panX=0;state.panY=0;applyView()});$('styleSelect').addEventListener('change',e=>{state.style=e.target.value;applyStyle()});$('strokeWidth').addEventListener('change',applyStyle);
$('showPhysicalLayer').addEventListener('change',e=>{state.showPhysicalLayer=e.target.checked;const layer=$('liveMap')?.querySelector('#physicalTerrainLayer');if(layer)layer.style.display=state.showPhysicalLayer?'':'none';updateCountryExportPreview();scheduleCameraViewPreview();});
$('showCountryLayer').addEventListener('change',e=>{state.showCountryLayer=e.target.checked;$('mapCanvas').classList.toggle('country-layer-hidden',!state.showCountryLayer);state.paths.forEach(p=>{p.setAttribute('stroke-opacity',state.showCountryLayer?'1':'0');p.setAttribute('fill-opacity',state.showCountryLayer?'1':'0');});updateCountryExportPreview();scheduleCameraViewPreview();});
$('fitMap').onclick=()=>{state.zoom=1;state.panX=0;state.panY=0;state.view='world';$('viewSelect').value='world';state.customViewBox=null;state.customViewSource=null;state.isolated=false;state.paths.forEach(p=>p.style.opacity='1');applyView();updateSelection()};$('zoomIn').onclick=()=>zoomAround(state.zoom*1.25);$('zoomOut').onclick=()=>zoomAround(state.zoom/1.25);
$('mapCanvas').addEventListener('pointerdown',e=>{if(e.target.closest('.country'))return;state.drag={x:e.clientX,y:e.clientY,px:state.panX,py:state.panY};$('mapCanvas').setPointerCapture(e.pointerId)});$('mapCanvas').addEventListener('pointermove',e=>{if(!state.drag)return;state.panX=state.drag.px+(e.clientX-state.drag.x);state.panY=state.drag.py+(e.clientY-state.drag.y);if(state.customViewSource==='auto-fit')state.customViewSource='manual';applyView()});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>$('mapCanvas').addEventListener(ev,()=>state.drag=null));$('mapCanvas').addEventListener('wheel',e=>{e.preventDefault();zoomAround(state.zoom*(e.deltaY<0?1.15:1/1.15),e.clientX,e.clientY)},{passive:false});
function featureName(p,i){
  const explicit=(p.getAttribute('data-name')||p.getAttribute('data-country-name')||p.getAttribute('title')||p.getAttribute('aria-label')||p.getAttribute('name')||p.querySelector(':scope > title')?.textContent||'').trim();
  if(explicit)return explicit;
  const raw=(p.getAttribute('data-code')||p.getAttribute('data-country-id')||p.id||'').trim().toUpperCase();
  if(/^[A-Z]{2}$/.test(raw)){try{return new Intl.DisplayNames(['en'],{type:'region'}).of(raw)||raw}catch{return raw}}
  return p.id||`Region ${i+1}`;
}
function shouldAutoFitAfterSelect(){return !!$('autoFitCountry')?.checked}
function selectFeature(i){
  if(!Number.isInteger(i)||!state.paths[i])return;
  if(state.selectionMode==='single'){state.selected.clear();state.selected.add(i)}
  else{state.selected.has(i)?state.selected.delete(i):state.selected.add(i)}
  updateSelection();
  if(state.selected.size&&shouldAutoFitAfterSelect())zoomToSelection('auto-fit');
}
function updateSelection(){state.paths.forEach((p,i)=>p.classList.toggle('selected',state.selected.has(i)));const list=[...state.selected].map(i=>state.paths[i]);const label=`${list.length} selected`; $('selectionCount').textContent=`${list.length} region${list.length===1?'':'s'} selected`;$('selectionCountPanel').textContent=label;$('selectedList').innerHTML=list.length?list.map(p=>`<div class="selected-item"><span><b>${esc(p.dataset.name)}</b><small>${esc(p.dataset.code||'Map feature')}</small></span><button class="remove-selected" data-remove="${p.dataset.index}" aria-label="Remove ${esc(p.dataset.name)}">×</button></div>`).join(''):'<div class="selection-empty">No countries selected yet. Click a country on the map or search above.</div>';$('zoomSelection').disabled=!list.length;$('isolateSelection').disabled=!list.length;$('isolateSelection').textContent=state.isolated?'Show all countries':'Isolate selection';$('selectionHint').textContent=state.selectionMode==='single'?'Single mode: click one country to replace the selection.':'Multiple mode: click countries to add or remove them.';if($('countryExportPreview'))updateCountryExportPreview();scheduleCameraViewPreview();}
function zoomToSelection(source='manual'){if(!state.selected.size)return;const b=selectionBBox();if(!b)return;const pad=Math.max(b.width,b.height)*.16;state.customViewBox=`${b.x-pad} ${b.y-pad} ${b.width+pad*2} ${b.height+pad*2}`;state.customViewSource=source;state.zoom=1;state.panX=0;state.panY=0;applyView()}
$('clearSelection').onclick=()=>{state.selected.clear();state.isolated=false;if(state.customViewSource==='auto-fit'){state.customViewBox=null;state.customViewSource=null;}state.paths.forEach(p=>p.style.opacity='1');updateSelection();applyView()};$('selectedList').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.selected.delete(+b.dataset.remove);if(!state.selected.size){state.isolated=false;if(state.customViewSource==='auto-fit'){state.customViewBox=null;state.customViewSource=null;}state.paths.forEach(p=>p.style.opacity='1');applyView()}updateSelection()});$('zoomSelection').onclick=zoomToSelection;$('isolateSelection').onclick=()=>{if(!state.selected.size)return;state.isolated=!state.isolated;state.paths.forEach((p,i)=>p.style.opacity=state.isolated&&!state.selected.has(i)?'.12':'1');if(state.isolated)zoomToSelection('manual');else{state.customViewBox=null;state.customViewSource=null;applyView()}updateSelection()};document.querySelectorAll('[data-selection-mode]').forEach(b=>b.addEventListener('click',()=>{state.selectionMode=b.dataset.selectionMode;document.querySelectorAll('[data-selection-mode]').forEach(x=>x.classList.toggle('active',x===b));updateSelection()}));function normalizeFeatureQuery(v){return String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim()}
function findCountry(){
  const q=normalizeFeatureQuery($('countrySearch').value);if(!q)return toast('Type a country name first.');
  const exact=state.paths.filter(p=>normalizeFeatureQuery(p.dataset.name)===q||normalizeFeatureQuery(p.dataset.code)===q);
  const matches=exact.length?exact:state.paths.filter(p=>normalizeFeatureQuery(p.dataset.name).includes(q)||normalizeFeatureQuery(p.dataset.code).includes(q));
  if(!matches.length)return toast('No matching country found in this map.');
  if(matches.length>1){$('countryOptions').innerHTML=matches.slice(0,30).map(p=>`<option value="${esc(p.dataset.name)}"></option>`).join('');return toast(`${matches.length} matches found. Choose the exact country name from suggestions.`)}
  const p=matches[0];if(state.selectionMode==='single')state.selected.clear();state.selected.add(+p.dataset.index);
  state.isolated=false;state.paths.forEach(x=>x.style.opacity='1');updateSelection();if(shouldAutoFitAfterSelect())zoomToSelection('auto-fit');else applyView();p.focus();
} $('findCountry').onclick=findCountry;$('countrySearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findCountry()}});$('countrySearch').addEventListener('input',()=>{const q=$('countrySearch').value.trim().toLowerCase();const matches=state.paths.filter(p=>!q||p.dataset.name.toLowerCase().includes(q)||p.dataset.code.toLowerCase().includes(q)).slice(0,100);$('countryOptions').innerHTML=matches.map(p=>`<option value="${esc(p.dataset.name)}"></option>`).join('')});
$('applyStyle').onclick=()=>{if(!state.selected.size)return toast('Select one or more regions first.');for(const i of state.selected){const feature=state.paths[i];feature.dataset.customfill=$('fillColor').value;feature.dataset.customstroke=$('strokeColor').value;feature.setAttribute('fill',$('fillColor').value);feature.setAttribute('stroke',$('strokeColor').value);feature.setAttribute('stroke-width',$('strokeWidth').value);feature.setAttribute('fill-opacity','1');feature.setAttribute('stroke-opacity',state.showCountryLayer?'1':'0')}updateSelection();applyView();toast(`Applied ${$('fillColor').value.toUpperCase()} to ${state.selected.size} selected region${state.selected.size===1?'':'s'}.`) };
function resolveCountryAppearance(feature){
  const customFill=String(feature?.dataset?.customfill||'').trim();
  const customStroke=String(feature?.dataset?.customstroke||'').trim();
  const physical=!customFill&&state.style==='physical'&&state.showPhysicalLayer&&!!state.physicalTextureData;
  const baseFill=state.style==='blank'?'#f0f3f5':(feature?.dataset?.basefill&&feature.dataset.basefill!=='none'&&feature.dataset.basefill!=='transparent'?feature.dataset.basefill:'#9aaab7');
  const baseStroke=state.style==='blank'?'#778493':state.style==='physical'?'#465c4b':state.style==='satellite'?'#c9b997':'#dce4ec';
  return {customFill,customStroke,physical,fill:customFill||(physical?'none':baseFill),stroke:customStroke||baseStroke};
}
function countryExportDimensions(){return {w:Math.round(+$('countryExportWidth').value),h:Math.round(+$('countryExportHeight').value)}}
function buildCountryExportSvg({quiet=false}={}){
  const selectedIndices=[...state.selected].filter(i=>Number.isInteger(i)&&state.paths[i]);
  if(selectedIndices.length!==1){
    $('countryExportTarget').textContent=selectedIndices.length?`${selectedIndices.length} countries selected — choose one`:'No country selected';
    if(!quiet)toast('Select exactly one country for Country PNG export.');
    return null;
  }
  const feature=state.paths[selectedIndices[0]],name=feature.dataset.name;
  const box=selectionBBox();
  if(!box||![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0){if(!quiet)toast('Selected country has no valid vector bounds.');return null}
  const {w,h}=countryExportDimensions();
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<256||h<256||w>8192||h>8192||w*h>33554432){if(!quiet)toast('Choose dimensions between 256 and 8192 px with a maximum of 32 megapixels.');return null}
  const NS='http://www.w3.org/2000/svg',live=$('liveMap');
  if(!live){if(!quiet)toast('Map is not loaded.');return null}
  const out=document.createElementNS(NS,'svg');
  out.setAttribute('xmlns',NS);out.setAttribute('width',w);out.setAttribute('height',h);out.setAttribute('viewBox',`0 0 ${w} ${h}`);out.setAttribute('preserveAspectRatio','none');
  const defs=document.createElementNS(NS,'defs');
  live.querySelectorAll('defs').forEach(sourceDefs=>[...sourceDefs.children].forEach(definition=>defs.appendChild(definition.cloneNode(true))));
  const clip=document.createElementNS(NS,'clipPath');clip.setAttribute('id','mmCountryCropClip');clip.setAttribute('clipPathUnits','userSpaceOnUse');
  const clipGroup=document.createElementNS(NS,'g');
  const geometry=cloneFeatureWithAncestors(feature,live);geometry.removeAttribute('class');geometry.removeAttribute('style');
  geometry.querySelectorAll?.('.country').forEach(n=>n.classList.remove('country'));
  const clipLeaf=geometry.matches?.('[data-index]')?geometry:geometry.querySelector?.('[data-index]')||geometry;
  clipLeaf.removeAttribute('class');clipLeaf.removeAttribute('style');clipLeaf.setAttribute('fill','#fff');clipLeaf.setAttribute('stroke','none');clipLeaf.setAttribute('fill-opacity','1');clipGroup.appendChild(geometry);
  clip.appendChild(clipGroup);defs.appendChild(clip);out.appendChild(defs);
  const pad=Math.max(box.width,box.height)*.055;
  const crop={x:box.x-pad,y:box.y-pad,width:box.width+pad*2,height:box.height+pad*2};
  const scale=Math.min(w/crop.width,h/crop.height);
  const tx=(w-crop.width*scale)/2-crop.x*scale,ty=(h-crop.height*scale)/2-crop.y*scale;
  const group=document.createElementNS(NS,'g');group.setAttribute('transform',`translate(${tx} ${ty}) scale(${scale})`);
  const appearance=resolveCountryAppearance(feature);
  const physicalMode=appearance.physical;
  if(physicalMode){
    const vb=(state.baseViewBox||live.getAttribute('viewBox')||'0 0 1000 600').trim().split(/[ ,]+/).map(Number),[x,y,vw,vh]=vb;
    const image=document.createElementNS(NS,'image');image.setAttribute('href',state.physicalTextureData);image.setAttribute('x',x);image.setAttribute('y',y);image.setAttribute('width',vw);image.setAttribute('height',vh);image.setAttribute('preserveAspectRatio','none');
    const textureGroup=document.createElementNS(NS,'g');textureGroup.setAttribute('clip-path','url(#mmCountryCropClip)');textureGroup.setAttribute('data-physical-texture-clip','country-union');textureGroup.appendChild(image);group.appendChild(textureGroup);
  }
  const country=cloneFeatureWithAncestors(feature,live);country.removeAttribute('class');country.removeAttribute('style');
  const leaf=country.matches?.('[data-index]')?country:country.querySelector?.('[data-index]')||country;leaf.removeAttribute('class');leaf.removeAttribute('style');
  if(physicalMode){leaf.setAttribute('fill','none');leaf.setAttribute('stroke',state.showCountryLayer?(appearance.customStroke||appearance.stroke):'none')}
  else{leaf.setAttribute('fill',appearance.fill);leaf.setAttribute('stroke',state.showCountryLayer?(appearance.customStroke||appearance.stroke):'none')}
  leaf.setAttribute('stroke-width',$('strokeWidth').value||'1.2');leaf.setAttribute('vector-effect','non-scaling-stroke');leaf.setAttribute('stroke-opacity',state.showCountryLayer?'1':'0');group.appendChild(country);out.appendChild(group);
  if(!$('countryExportTransparent').checked){const bg=document.createElementNS(NS,'rect');bg.setAttribute('width',w);bg.setAttribute('height',h);bg.setAttribute('fill','#101720');out.insertBefore(bg,defs)}
  $('countryExportTarget').textContent=`${name} · ${w} × ${h}${physicalMode?' · Physical texture':''}`;
  $('countryExportHint').textContent=appearance.customFill?`Only ${name} is included, filled with your applied colour ${appearance.customFill}. Everything outside its boundary is transparent.`:physicalMode?'Only the selected country is included, filled with the physical relief texture. Everything outside its boundary is transparent.':'Only the selected country is included. Its surroundings are transparent; the map camera and other countries are not exported.';
  return {svg:out,name,w,h,physical:physicalMode,transparent:$('countryExportTransparent').checked};
}
function cameraFrameSpec(preview=false){
  const viewBox=editorCameraViewBox(),nums=viewBox.trim().split(/[ ,]+/).map(Number);
  if(nums.length!==4||!nums.every(Number.isFinite)||nums[2]<=0||nums[3]<=0)return null;
  const aspect=nums[2]/nums[3],requestedLongEdge=preview?760:(Number($('cameraSvgPreset')?.value)||3840);
  let w=Math.max(1,Math.round(aspect>=1?requestedLongEdge:requestedLongEdge*aspect));
  let h=Math.max(1,Math.round(aspect>=1?requestedLongEdge/aspect:requestedLongEdge));
  // Keep the camera SVG and full-frame positioned PNG pixel-identical. The
  // raster companion is capped at 32 MP for reliable browser canvas memory.
  const maxPixels=33554432,rawPixels=w*h;let capped=false;
  if(!preview&&rawPixels>maxPixels){const factor=Math.sqrt(maxPixels/rawPixels);w=Math.max(1,Math.floor(w*factor));h=Math.max(1,Math.floor(h*factor));capped=true;}
  return {viewBox,nums,aspect,w,h,longEdge:requestedLongEdge,capped};
}
function buildCameraViewSvg({preview=false}={}){
  const live=$('liveMap');if(!live)return null;
  const frame=cameraFrameSpec(preview);if(!frame){toast('Current editor camera has invalid dimensions.');return null}
  const {viewBox,w,h,aspect}=frame,NS='http://www.w3.org/2000/svg';
  const svg=live.cloneNode(true);
  svg.removeAttribute('id');svg.removeAttribute('class');svg.removeAttribute('style');
  svg.setAttribute('xmlns',NS);svg.setAttribute('version','1.1');svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('viewBox',viewBox);svg.setAttribute('preserveAspectRatio','none');
  // Camera map is intentionally selection-independent: remove the active
  // feature state, isolation opacity and editor-only click affordances.
  const terrain=svg.querySelector('#physicalTerrainLayer');
  if(state.style==='physical'&&state.showPhysicalLayer&&state.physicalTextureData){
    if(terrain){terrain.removeAttribute('id');terrain.removeAttribute('style');terrain.setAttribute('href',state.physicalTextureData);terrain.setAttribute('display','inline')}
    else{const base=(state.baseViewBox||'0 0 1000 600').trim().split(/[ ,]+/).map(Number),[x,y,vw,vh]=base;const image=document.createElementNS(NS,'image');image.setAttribute('href',state.physicalTextureData);image.setAttribute('x',x);image.setAttribute('y',y);image.setAttribute('width',vw);image.setAttribute('height',vh);image.setAttribute('preserveAspectRatio','none');svg.insertBefore(image,svg.firstChild)}
  }else terrain?.remove();
  // Keep the current map and applied fill colours, but remove every geometry outline.
  svg.querySelectorAll('path,polygon,polyline,line,rect,circle,ellipse').forEach(shape=>{
    if(shape.closest('defs,clipPath,mask,pattern,marker,symbol'))return;
    shape.setAttribute('stroke','none');shape.setAttribute('stroke-opacity','0');
  });
  svg.querySelectorAll('[data-index]').forEach(path=>{
    const index=Number(path.getAttribute('data-index')),source=state.paths[index];if(!source)return;
    path.classList.remove('country','selected');path.removeAttribute('tabindex');path.removeAttribute('role');path.removeAttribute('aria-label');path.removeAttribute('data-index');path.removeAttribute('data-code');path.removeAttribute('data-name');path.removeAttribute('data-basefill');path.removeAttribute('style');path.setAttribute('pointer-events','none');
    const appearance=resolveCountryAppearance(source);
    path.setAttribute('fill',appearance.fill);path.setAttribute('stroke','none');path.setAttribute('stroke-width','0');
    path.setAttribute('fill-opacity',appearance.physical?'0':'1');path.setAttribute('stroke-opacity','0');path.setAttribute('opacity','1');path.removeAttribute('filter');
  });
  const title=document.createElementNS(NS,'title');title.textContent=`${state.metadata?.name||'Map'} — ${$('viewSelect')?.selectedOptions?.[0]?.textContent||'Current camera'} — outline-free camera map`;svg.insertBefore(title,svg.firstChild);
  const xml=new XMLSerializer().serializeToString(svg);return {svg,xml,w,h,viewBox,aspect};
}
function cleanFeatureClone(feature,live){
  const clone=cloneFeatureWithAncestors(feature,live);
  clone.removeAttribute('class');clone.removeAttribute('style');clone.removeAttribute('data-index');clone.removeAttribute('data-code');clone.removeAttribute('data-name');clone.removeAttribute('tabindex');clone.removeAttribute('role');
  const leaf=clone.matches?.('[data-index]')?clone:clone.querySelector?.('[data-index]')||clone;
  leaf.removeAttribute('class');leaf.removeAttribute('style');leaf.removeAttribute('data-index');leaf.removeAttribute('data-code');leaf.removeAttribute('data-name');leaf.removeAttribute('tabindex');leaf.removeAttribute('role');
  return {clone,leaf};
}
function buildPositionedCountrySvg({preview=false}={}){
  const selected=[...state.selected].filter(i=>Number.isInteger(i)&&state.paths[i]);
  if(selected.length!==1){if(!preview)toast(selected.length?'Select exactly one country for positioned export.':'Select a country first.');return null;}
  const live=$('liveMap'),feature=state.paths[selected[0]],bounds=featureBoundsInRoot(feature,live),frame=cameraFrameSpec(preview);
  if(!live||!frame||!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)return null;
  if(frame.w*frame.h>33554432){if(!preview)toast('This camera frame exceeds the safe 32-megapixel PNG limit. Choose 4K or reduce the camera aspect.');return null;}
  const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');
  svg.setAttribute('xmlns',NS);svg.setAttribute('version','1.1');svg.setAttribute('width',frame.w);svg.setAttribute('height',frame.h);svg.setAttribute('viewBox',frame.viewBox);svg.setAttribute('preserveAspectRatio','none');
  const defs=document.createElementNS(NS,'defs');
  live.querySelectorAll('defs').forEach(source=>[...source.children].forEach(node=>defs.appendChild(node.cloneNode(true))));
  const clip=document.createElementNS(NS,'clipPath');clip.setAttribute('id','mmPositionedCountryClip');clip.setAttribute('clipPathUnits','userSpaceOnUse');
  const {clone:clipGeometry,leaf:clipLeaf}=cleanFeatureClone(feature,live);clipLeaf.setAttribute('fill','#fff');clipLeaf.setAttribute('fill-opacity','1');clipLeaf.setAttribute('stroke','none');clipLeaf.setAttribute('stroke-opacity','0');clip.appendChild(clipGeometry);defs.appendChild(clip);svg.appendChild(defs);
  const appearance=resolveCountryAppearance(feature);
  const physical=appearance.physical;
  if(physical){
    const base=(state.baseViewBox||live.getAttribute('viewBox')||'0 0 1000 600').trim().split(/[ ,]+/).map(Number),[x,y,w,h]=base;
    const texture=document.createElementNS(NS,'image');texture.setAttribute('href',state.physicalTextureData);texture.setAttribute('x',x);texture.setAttribute('y',y);texture.setAttribute('width',w);texture.setAttribute('height',h);texture.setAttribute('preserveAspectRatio','none');texture.setAttribute('clip-path','url(#mmPositionedCountryClip)');svg.appendChild(texture);
  }
  const {clone:country,leaf}=cleanFeatureClone(feature,live);
  if(physical){leaf.setAttribute('fill','none');leaf.setAttribute('fill-opacity','0')}
  else{leaf.setAttribute('fill',appearance.fill);leaf.setAttribute('fill-opacity','1')}
  leaf.setAttribute('stroke',state.showCountryLayer?appearance.stroke:'none');leaf.setAttribute('stroke-width',$('strokeWidth')?.value||'0.8');leaf.setAttribute('stroke-opacity',state.showCountryLayer?'1':'0');leaf.setAttribute('vector-effect','non-scaling-stroke');svg.appendChild(country);
  const [cx,cy,cw,ch]=frame.nums;
  const ix=Math.max(bounds.x,cx),iy=Math.max(bounds.y,cy),ir=Math.min(bounds.x+bounds.width,cx+cw),ib=Math.min(bounds.y+bounds.height,cy+ch);
  const visible=ir>ix&&ib>iy?{x:ix,y:iy,width:ir-ix,height:ib-iy}:null;
  const sourceToPixel=b=>({x:(b.x-cx)/cw*frame.w,y:(b.y-cy)/ch*frame.h,width:b.width/cw*frame.w,height:b.height/ch*frame.h});
  return {svg,xml:new XMLSerializer().serializeToString(svg),w:frame.w,h:frame.h,viewBox:frame.viewBox,aspect:frame.aspect,physical,feature,name:feature.dataset.name,code:featureCode(feature),featureIndex:selected[0],sourceBounds:bounds,visibleBounds:visible,visiblePixelBounds:visible?sourceToPixel(visible):null,fullPixelBounds:sourceToPixel(bounds),fullyInsideCamera:!!visible&&visible.x===bounds.x&&visible.y===bounds.y&&visible.width===bounds.width&&visible.height===bounds.height,frame};
}

let countryPreviewJob=0;
async function renderCountryPreviewBlob(result){
  const factor=Math.min(1,680/result.w,420/result.h),pw=Math.max(1,Math.round(result.w*factor)),ph=Math.max(1,Math.round(result.h*factor));
  const scaled=()=>{const svg=result.svg.cloneNode(true);svg.setAttribute('width',pw);svg.setAttribute('height',ph);return svg};
  const canvas=document.createElement('canvas');canvas.width=pw;canvas.height=ph;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Preview canvas could not be allocated.');
  if(result.physical){
    const base=scaled(),mask=scaled(),outline=scaled();
    const bg=base.querySelector('g[transform]'),mg=mask.querySelector('g[transform]'),og=outline.querySelector('g[transform]');
    if(!bg||!mg||!og)throw new Error('Physical preview layers are incomplete.');
    const texture=bg.querySelector('[data-physical-texture-clip]');if(!texture||!texture.querySelector('image'))throw new Error('Physical relief texture is missing.');
    texture.removeAttribute('clip-path');texture.removeAttribute('data-physical-texture-clip');
    [...bg.children].forEach(child=>{if(child!==texture)child.remove()});
    [...mg.children].forEach(child=>{if(child.querySelector?.('image')){child.remove();return}const leaf=child.matches?.('[data-index]')?child:child.querySelector?.('[data-index]');if(!leaf){child.remove();return}leaf.setAttribute('fill','#fff');leaf.setAttribute('fill-opacity','1');leaf.setAttribute('stroke','none');leaf.setAttribute('stroke-opacity','0')});
    [...og.children].forEach(child=>{if(child.querySelector?.('image'))child.remove()});
    const [bi,mi,oi]=await Promise.all([renderSvgNodeToImage(base),renderSvgNodeToImage(mask),renderSvgNodeToImage(outline)]);
    const clipped=document.createElement('canvas');clipped.width=pw;clipped.height=ph;const cc=clipped.getContext('2d');if(!cc)throw new Error('Preview mask canvas could not be allocated.');
    cc.drawImage(bi,0,0,pw,ph);cc.globalCompositeOperation='destination-in';cc.drawImage(mi,0,0,pw,ph);cc.globalCompositeOperation='source-over';
    ctx.drawImage(clipped,0,0);ctx.drawImage(oi,0,0,pw,ph);
  }else{
    const image=await renderSvgNodeToImage(scaled());ctx.drawImage(image,0,0,pw,ph);
  }
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Preview image encoding failed.')),'image/png'));
}
async function updateCountryExportPreview(){
  const job=++countryPreviewJob,result=buildCountryExportSvg({quiet:true}),img=$('countryExportPreview'),empty=$('countryExportPreviewEmpty');
  if(!result){if(countryPreviewUrl){URL.revokeObjectURL(countryPreviewUrl);countryPreviewUrl=null}img.removeAttribute('src');img.style.display='none';empty.style.display='block';return}
  try{
    const blob=await renderCountryPreviewBlob(result);if(job!==countryPreviewJob)return;
    if(countryPreviewUrl)URL.revokeObjectURL(countryPreviewUrl);countryPreviewUrl=URL.createObjectURL(blob);img.src=countryPreviewUrl;img.style.display='block';empty.style.display='none';
  }catch(error){if(job!==countryPreviewJob)return;img.removeAttribute('src');img.style.display='none';empty.textContent=`Preview failed: ${error.message}`;empty.style.display='block'}
}
function updateCameraViewPreview(){
  const img=$('cameraViewPreview'),empty=$('cameraViewPreviewEmpty');if(!img||!$('liveMap'))return;
  const result=buildCameraViewSvg({preview:true});if(!result){img.removeAttribute('src');img.style.display='none';empty.style.display='block';return}
  if(cameraViewPreviewUrl)URL.revokeObjectURL(cameraViewPreviewUrl);
  cameraViewPreviewUrl=URL.createObjectURL(new Blob([result.xml],{type:'image/svg+xml;charset=utf-8'}));img.src=cameraViewPreviewUrl;img.style.display='block';empty.style.display='none';
  const context=$('positionedCountryContext');if(context){context.src=cameraViewPreviewUrl;context.style.display='block'}
  $('cameraViewInfo').textContent=`${$('viewSelect')?.selectedOptions?.[0]?.textContent||'Current view'} · ${Math.round(state.zoom*100)}% zoom · pan ${Math.round(state.panX)}, ${Math.round(state.panY)} px · ${result.w} × ${result.h}${cameraFrameSpec(false)?.capped?' · auto-limited to 32 MP':''}. No outlines; applied country fills retained.`;
}
async function renderSvgToPngBlob(svg,w,h){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>33554432)throw new Error('Output exceeds the safe 32-megapixel PNG limit. Choose 4K or lower.');
  const image=await renderSvgNodeToImage(svg),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PNG canvas could not be allocated.');ctx.clearRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encoding failed.')),'image/png'));
}
async function renderSvgToJpegBlob(svg,w,h,background='#101720',quality=.94){
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>33554432)throw new Error('JPEG output exceeds the safe 32-megapixel limit. Choose 4K or lower.');
  const image=await renderSvgNodeToImage(svg),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('JPEG canvas could not be allocated.');
  ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.drawImage(image,0,0,w,h);
  return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('JPEG encoding failed.')),'image/jpeg',quality));
}
async function updatePositionedCountryPreview(){
  const job=++positionedPreviewJob,img=$('positionedCountryPreview'),empty=$('positionedCountryPreviewEmpty'),info=$('positionedCountryInfo');if(!img||!empty||!$('liveMap'))return;
  const result=buildPositionedCountrySvg({preview:true});
  if(!result){if(positionedPreviewUrl){URL.revokeObjectURL(positionedPreviewUrl);positionedPreviewUrl=null}img.removeAttribute('src');img.style.display='none';empty.style.display='block';empty.textContent=state.selected.size?'Select exactly one country for its placement preview.':'Select one country to preview its position on the current map.';if(info)info.textContent='Waiting for a country and camera';return}
  if(!result.visibleBounds){img.removeAttribute('src');img.style.display='none';empty.textContent=`${result.name} is outside this camera view. Pan or zoom the map to include it.`;empty.style.display='block';if(info)info.textContent=`${result.name} is outside the current camera frame.`;return}
  try{const blob=await renderSvgToPngBlob(result.svg,result.w,result.h);if(job!==positionedPreviewJob)return;if(positionedPreviewUrl)URL.revokeObjectURL(positionedPreviewUrl);positionedPreviewUrl=URL.createObjectURL(blob);img.src=positionedPreviewUrl;img.style.display='block';empty.style.display='none';if(info){const b=result.visiblePixelBounds;info.textContent=b?`${result.name} · ${result.w} × ${result.h} full-frame PNG · X ${b.x.toFixed(1)} px · Y ${b.y.toFixed(1)} px · W ${b.width.toFixed(1)} px · H ${b.height.toFixed(1)} px`:`${result.name} is outside the current camera frame. Change the camera to include it.`}}
  catch(error){if(job!==positionedPreviewJob)return;img.removeAttribute('src');img.style.display='none';empty.textContent=`Placement preview failed: ${error.message}`;empty.style.display='block';if(info)info.textContent='Placement preview unavailable';}
}

async function renderSvgNodeToImage(svgNode){
  const xml=new XMLSerializer().serializeToString(svgNode),blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
  try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('SVG render failed'));img.src=url});return img}
  finally{URL.revokeObjectURL(url)}
}
async function renderPhysicalExportPng(result,fileName){
  const base=result.svg.cloneNode(true),mask=result.svg.cloneNode(true),outline=result.svg.cloneNode(true);
  const baseGroup=base.querySelector('g[transform]'),maskGroup=mask.querySelector('g[transform]'),outlineGroup=outline.querySelector('g[transform]');
  if(!baseGroup||!maskGroup||!outlineGroup)throw new Error('Physical export layers are incomplete');
  const texture=baseGroup.querySelector('g[clip-path]');if(!texture||!texture.querySelector('image'))throw new Error('Embedded physical texture is unavailable');
  texture.removeAttribute('clip-path');[...baseGroup.children].forEach(child=>{if(child!==texture)child.remove()});
  [...maskGroup.children].forEach(child=>{if(child.querySelector?.('image')){child.remove();return}const leaf=child.matches?.('[data-index]')?child:child.querySelector?.('[data-index]');if(!leaf){child.remove();return}leaf.setAttribute('fill','#fff');leaf.setAttribute('fill-opacity','1');leaf.setAttribute('stroke','none');leaf.setAttribute('stroke-opacity','0')});
  [...outlineGroup.children].forEach(child=>{if(child.querySelector?.('image'))child.remove()});
  const [baseImage,maskImage,outlineImage]=await Promise.all([renderSvgNodeToImage(base),renderSvgNodeToImage(mask),renderSvgNodeToImage(outline)]);
  const clipped=document.createElement('canvas');clipped.width=result.w;clipped.height=result.h;const cc=clipped.getContext('2d');if(!cc)throw new Error('Physical texture canvas allocation failed');cc.drawImage(baseImage,0,0,result.w,result.h);cc.globalCompositeOperation='destination-in';cc.drawImage(maskImage,0,0,result.w,result.h);cc.globalCompositeOperation='source-over';
  const canvas=document.createElement('canvas');canvas.width=result.w;canvas.height=result.h;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas allocation failed');if(!result.transparent){ctx.fillStyle='#101720';ctx.fillRect(0,0,result.w,result.h)}ctx.drawImage(clipped,0,0);ctx.drawImage(outlineImage,0,0,result.w,result.h);
  const png=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('PNG encoding failed')),'image/png'));download(png,fileName);toast(`${fileName} exported.`);
}
async function renderExportPng(result,fileName){
  if(!result)return;
  try{if(result.physical){await renderPhysicalExportPng(result,fileName);return}const img=await renderSvgNodeToImage(result.svg);const canvas=document.createElement('canvas');canvas.width=result.w;canvas.height=result.h;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas allocation failed');ctx.clearRect(0,0,result.w,result.h);ctx.drawImage(img,0,0,result.w,result.h);const png=await new Promise((resolve,reject)=>canvas.toBlob(v=>v?resolve(v):reject(new Error('PNG encoding failed')),'image/png'));download(png,fileName);toast(`${fileName} exported.`)}catch(e){toast(`PNG export failed: ${e.message}`)}
}
async function downloadCountryPng(){const result=buildCountryExportSvg();if(!result)return;const safe=result.name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'country';await renderExportPng(result,`${safe}-${result.w}x${result.h}.png`)}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}return (crc^0xffffffff)>>>0}
function concatBytes(parts){const total=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(total);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}return out}
function zipStoredFiles(files){
  const encoder=new TextEncoder(),local=[],central=[];let offset=0;
  const date=new Date(),dosTime=((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|Math.floor(date.getSeconds()/2),dosDate=(((date.getFullYear()-1980)&127)<<9)|((date.getMonth()+1)<<5)|date.getDate();
  const u16=(v)=>{const a=new Uint8Array(2);new DataView(a.buffer).setUint16(0,v,true);return a};
  const u32=(v)=>{const a=new Uint8Array(4);new DataView(a.buffer).setUint32(0,v>>>0,true);return a};
  for(const file of files){const name=encoder.encode(file.name),data=file.data instanceof Uint8Array?file.data:encoder.encode(String(file.data)),crc=crc32(data);
    const localHeader=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name]);local.push(localHeader,data);
    central.push(concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(dosTime),u16(dosDate),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));offset+=localHeader.length+data.length;
  }
  const localBytes=concatBytes(local),centralBytes=concatBytes(central),end=concatBytes([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(centralBytes.length),u32(localBytes.length),u16(0)]);
  return new Blob([localBytes,centralBytes,end],{type:'application/zip'});
}
async function sourceMapFingerprint(text){
  try{if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return {algorithm:'SHA-256',value:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('')}}}catch{}
  // Older/insecure embedded preview contexts may not expose SubtleCrypto. Keep
  // a stable non-cryptographic fingerprint rather than leaving map identity blank.
  let a=0x811c9dc5,b=0x9e3779b9;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^(c+i),0x85ebca6b)}
  return {algorithm:'FNV-1a 32-bit pair (non-cryptographic fallback)',value:`${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`};
}
async function downloadPositionedCountryPackage(){
  const result=buildPositionedCountrySvg();if(!result)return;if(!result.visibleBounds){toast('The selected country is outside the current camera. Pan or zoom to include it before exporting its position.');return}
  try{
    const png=await renderSvgToPngBlob(result.svg,result.w,result.h);
    const cameraMap=buildCameraViewSvg();
    if(!cameraMap||cameraMap.w!==result.w||cameraMap.h!==result.h)throw new Error('Camera and positioned-country output frames do not match.');
    const jpeg=await renderSvgToJpegBlob(cameraMap.svg,cameraMap.w,cameraMap.h,'#101720',.95);
    const b=result.visiblePixelBounds,full=result.fullPixelBounds;
    const appliedFill=result.feature?.dataset?.customfill||null;
    const assetFingerprint=await sourceMapFingerprint(state.svgText);
    const round=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k,Number(v.toFixed(4))]));
    const manifest={
      format:'MapMotion Studio Positioned Country Package',schemaVersion:2,createdAt:new Date().toISOString(),
      files:{countryPng:'country-at-camera-position.png',cameraJpeg:'camera-map-with-country-highlight.jpg',cameraMapReference:'Download the matching outline-free Camera Map SVG from the same editor session.',placement:'placement.json'},
      map:{id:state.mapId,name:state.metadata?.name||state.mapId,sourceSvg:'world-india.svg',sourceViewBox:state.baseViewBox||null,sourceFingerprint:assetFingerprint,projection:state.metadata?.projection||'unknown',coverage:state.metadata?.coverage||'unknown'},
      camera:{view:state.view,viewLabel:$('viewSelect')?.selectedOptions?.[0]?.textContent||state.view,viewBox:result.viewBox,zoom:state.zoom,panPixels:{x:state.panX,y:state.panY},editorCanvasPixels:{width:$('mapCanvas').clientWidth,height:$('mapCanvas').clientHeight},style:state.style,physicalTextureIncluded:result.physical,output:{width:result.w,height:result.h,transparentCountryOverlay:'PNG',fullCameraComposition:'JPEG',jpegBackground:'#101720',jpegQuality:0.95},preserveAspectRatio:'none'},
      country:{name:result.name,code:result.code,featureIndex:result.featureIndex,appliedFill:appliedFill,appliedStroke:result.feature?.dataset?.customstroke||null,sourceMapBounds:round(result.sourceBounds),cameraFrameBoundsPixels:round(full),visibleCameraFrameBoundsPixels:b?round(b):null,normalizedCameraFrameBounds:b?round({x:b.x/result.w,y:b.y/result.h,width:b.width/result.w,height:b.height/result.h}):null,insideCamera:!!b,fullyInsideCamera:result.fullyInsideCamera},
      placement:{canvasWidth:result.w,canvasHeight:result.h,x:0,y:0,anchor:'center',position:{x:result.w/2,y:result.h/2},scalePercent:100,rotationDegrees:0,blendMode:'normal',alignment:'Import country-at-camera-position.png over the matching Camera Map export at the same canvas dimensions. Keep anchor centered, position at canvas center, scale 100%, rotation 0.'},
      coordinateNotes:{units:'Source SVG user units and output pixels',geographicCoordinates:'Not provided unless the source map is independently georeferenced.',alignmentGuarantee:'Pixel-exact relative placement only when the base camera map and this country package are exported from the same source map, same viewBox, same camera pan/zoom, same style framing, and the same camera output preset.'}
    };
    const safe=s=>String(s||'map').normalize('NFKD').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'map';
    const instructions=`MAPMOTION STUDIO — POSITIONED COUNTRY PACKAGE\n\nFiles included:\n- camera-map-with-country-highlight.jpg: complete current camera frame with the applied country colour and no country boundary outlines. This JPEG is flattened onto #101720 and is ready to use as a single image.\n- country-at-camera-position.png: selected country alone, transparent outside its geometry, already placed inside the same full camera frame. Use this PNG when you need an independent layer.\n- placement.json: map identity, source fingerprint, camera frame and exact pixel/normalized bounds.\n\nIMPORT STEPS FOR LAYERED COMPOSITING\n1. Export the matching outline-free Camera Map SVG from the same map and editor camera session.\n2. Convert that SVG to PNG if your editor needs a raster base map. Preserve the SVG output width and height.\n3. Create a composition/canvas of ${result.w} × ${result.h} pixels.\n4. Import the base camera map and country-at-camera-position.png.\n5. Keep both layers centered at X=${result.w/2}, Y=${result.h/2}, scale 100%, rotation 0°.\n6. Do not crop, fit-to-screen, or independently resize only one layer.\n\nThe JPEG is a flattened full-camera composition (not transparent). The PNG is the transparent overlay for compositing. Both use the same exact camera frame. The JPEG shows applied fill ${appliedFill||'(map default fill)'}.\n\nAlignment only applies to the matching source map and camera settings. The source map does not necessarily provide geographic latitude/longitude.\n`;
    const zip=zipStoredFiles([
      {name:'camera-map-with-country-highlight.jpg',data:new Uint8Array(await jpeg.arrayBuffer())},
      {name:'country-at-camera-position.png',data:new Uint8Array(await png.arrayBuffer())},
      {name:'placement.json',data:JSON.stringify(manifest,null,2)},
      {name:'IMPORT-INSTRUCTIONS.txt',data:instructions}
    ]);
    download(zip,`${safe(state.metadata?.name)}-${safe(result.name)}-positioned-country-package.zip`);
    toast('Positioned country package downloaded: full-frame JPEG + transparent PNG + exact placement metadata.');
  }catch(error){toast(`Positioned country export failed: ${error.message}`)}
}
function downloadCameraViewSvg(){
  const result=buildCameraViewSvg();if(!result)return;
  const safe=(state.metadata?.name||'map').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'map';
  const blob=new Blob([result.xml],{type:'image/svg+xml;charset=utf-8'});download(blob,`${safe}-${String($('viewSelect')?.value||'camera')}-camera-map-${result.w}x${result.h}.svg`);
  toast(`Camera map SVG downloaded · ${result.w} × ${result.h} · outlines removed, applied fills retained.`);
}
$('countryCanvasPreset').addEventListener('change',e=>{if(e.target.value==='custom')return;const [w,h]=e.target.value.split('x').map(Number);$('countryExportWidth').value=w;$('countryExportHeight').value=h;updateCountryExportPreview()});
['countryExportWidth','countryExportHeight','countryExportTransparent'].forEach(id=>$(id).addEventListener('input',()=>{if(id!=='countryExportTransparent')$('countryCanvasPreset').value='custom';updateCountryExportPreview()}));
$('downloadCountryPng').addEventListener('click',downloadCountryPng);
$('downloadPositionedCountryPackage').addEventListener('click',downloadPositionedCountryPackage);
$('downloadCameraSvg').addEventListener('click',downloadCameraViewSvg);
$('cameraSvgPreset').addEventListener('change',scheduleCameraViewPreview);
window.addEventListener('resize',()=>scheduleCameraViewPreview());

function cloneFeatureWithAncestors(feature, rootSvg){
  let node=feature.cloneNode(true),parent=feature.parentElement;
  while(parent&&parent!==rootSvg&&parent.tagName?.toLowerCase()!=='svg'){
    const wrapper=parent.cloneNode(false);wrapper.appendChild(node);node=wrapper;parent=parent.parentElement;
  }
  return node;
}
function featureBoundsInRoot(feature, rootSvg=$('liveMap')){
  const b=feature.getBBox();
  try{
    const featureMatrix=feature.getCTM(),rootMatrix=rootSvg.getCTM();
    if(featureMatrix&&rootMatrix){
      const matrix=rootMatrix.inverse().multiply(featureMatrix);
      const pts=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix));
      const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys);
      return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
    }
  }catch{}
  return {x:b.x,y:b.y,width:b.width,height:b.height};
}

function selectionBBox(){let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const i of state.selected){const b=featureBoundsInRoot(state.paths[i]);minX=Math.min(minX,b.x);minY=Math.min(minY,b.y);maxX=Math.max(maxX,b.x+b.width);maxY=Math.max(maxY,b.y+b.height)}return Number.isFinite(minX)?{x:minX,y:minY,width:maxX-minX,height:maxY-minY}:null}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1500)}
async function saveProject(){
  const name=prompt('Project name',state.projectName||'Untitled map project');if(!name)return;
  const data={
    version:4,view:state.view,style:state.style,customViewBox:state.customViewBox||null,customViewSource:state.customViewSource||null,zoom:state.zoom,panX:state.panX,panY:state.panY,
    isolated:state.isolated,showPhysicalLayer:state.showPhysicalLayer,showCountryLayer:state.showCountryLayer,
    selected:[...state.selected].map(i=>{const p=state.paths[i];return {name:p?.dataset.name,code:p?.dataset.code,index:i,fill:p?.dataset.customfill||null,stroke:p?.dataset.customstroke||null}}),
    countryExport:{width:$('countryExportWidth').value,height:$('countryExportHeight').value,transparent:$('countryExportTransparent').checked,cameraLongEdge:$('cameraSvgPreset').value}
  };
  const r=await api('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.projectId,name,map_id:state.mapId,data})});
  state.projectId=r.id;state.projectName=name;toast('Project saved with editor settings and selection.');
}
$('saveProject').onclick=()=>saveProject().catch(e=>toast(e.message));
async function loadProjects(){const ps=await api('/api/projects');$('projectList').innerHTML=ps.length?ps.map(p=>`<div class="project-row"><div><b>${esc(p.name)}</b><small>${esc(p.map_id)} · Updated ${new Date(p.updated_at+'Z').toLocaleString()}</small></div><div><button class="button small" onclick="reopenProject('${p.id}')">Open</button> <button class="button small" onclick="removeProject('${p.id}')">Delete</button></div></div>`).join(''):'<div class="panel">No saved projects yet. Open a map in the editor and choose Save project.</div>'}
window.reopenProject=async id=>{
  try{
    const p=(await api('/api/projects')).find(x=>x.id===id);if(!p)return toast('Saved project not found.');
    if(!state.maps.some(m=>m.id===p.map_id))await refreshMaps();
    state.projectId=p.id;state.projectName=p.name;state.mapId=p.map_id;state.view=p.data.view||'world';state.customViewBox=null;
    state.showPhysicalLayer=p.data.showPhysicalLayer!==false;state.showCountryLayer=p.data.showCountryLayer!==false;
    await loadEditor();state.style=p.data.style||'political';state.customViewBox=null;
    state.selected.clear();
    (p.data.selected||[]).forEach(x=>{
      let index=-1;
      if(x.code)index=state.paths.findIndex(q=>q.dataset.code===x.code);
      if(index<0&&x.name)index=state.paths.findIndex(q=>q.dataset.name===x.name);
      if(index<0&&Number.isInteger(x.index)&&state.paths[x.index])index=x.index;
      if(index>=0){state.selected.add(index);const feature=state.paths[index];if(x.fill){feature.dataset.customfill=x.fill;feature.setAttribute('fill',x.fill)}if(x.stroke){feature.dataset.customstroke=x.stroke;feature.setAttribute('stroke',x.stroke)}}
    });
    const ce=p.data.countryExport||{};
    for(const [key,id2] of Object.entries({width:'countryExportWidth',height:'countryExportHeight'})){if(ce[key]!=null)$(id2).value=ce[key]}
    if(ce.transparent!=null)$('countryExportTransparent').checked=!!ce.transparent;if(ce.cameraLongEdge)$('cameraSvgPreset').value=String(ce.cameraLongEdge);
    const presetValue=`${$('countryExportWidth').value}x${$('countryExportHeight').value}`;$('countryCanvasPreset').value=['1920x1080','2160x3840','3840x2160','4096x4096'].includes(presetValue)?presetValue:'custom';
    state.zoom=Number(p.data.zoom)||1;state.panX=Number(p.data.panX)||0;state.panY=Number(p.data.panY)||0;state.isolated=!!p.data.isolated;state.customViewBox=p.data.customViewBox||null;
    // Older 0.7.2 saves did not record why a custom viewBox existed. Infer the
    // old default Auto-fit camera only when Auto-fit was enabled and no manual
    // pan/zoom was saved; otherwise preserve it as an intentional custom camera.
    const legacyAutoFit=!!state.customViewBox&&!p.data.customViewSource&&!!ce.autoFit&&
      (state.view==='india'||!!CONTINENT_CODES[state.view])&&state.zoom===1&&state.panX===0&&state.panY===0;
    state.customViewSource=p.data.customViewSource||(legacyAutoFit?'auto-fit':state.customViewBox?'manual':null);
    if(cameraPlacementActive()&&state.customViewSource==='auto-fit'&&(state.view==='india'||CONTINENT_CODES[state.view])){
      state.customViewBox=null;state.customViewSource=null;state.zoom=1;state.panX=0;state.panY=0;
    }
    $('showPhysicalLayer').checked=state.showPhysicalLayer;$('showCountryLayer').checked=state.showCountryLayer;$('styleSelect').value=state.style;$('viewSelect').value=state.view;
    state.paths.forEach((feature,i)=>feature.style.opacity=state.isolated&&!state.selected.has(i)?'.12':'1');
    applyStyle();applyView();updateSelection();updateCountryExportPreview();scheduleCameraViewPreview();page('editor',{load:false});toast('Project restored, including its selection and export settings.');
  }catch(e){toast(`Could not reopen project: ${e.message}`)}
};
window.removeProject=async id=>{if(!confirm('Delete this saved project?'))return;await api(`/api/projects/${id}`,{method:'DELETE'});loadProjects()};
async function renderPairing(){const m=state.maps.find(x=>x.id===state.mapId)||state.maps[0];if(!m)return;state.mapId=m.id;state.metadata=m.metadata;const saved=m.metadata.alignment||{};[['imageOpacity',saved.opacity??55],['imageScale',saved.scale??100],['imageX',saved.x??0],['imageY',saved.y??0]].forEach(([id,v])=>$(id).value=v);syncAlign();$('pairMapName').textContent=m.name;$('pairStatus').textContent=m.metadata.pairing_status||'unpaired';$('pairPreview').innerHTML='<div class="empty-preview">Upload a satellite image to preview the pair.</div>';if(!state.svgText||state.loadedSvgMapId!==m.id){const r=await fetch(`/api/maps/${m.id}/asset/world-india.svg`);if(r.ok){state.svgText=await r.text();state.loadedSvgMapId=m.id;state.sourceSvg=new DOMParser().parseFromString(state.svgText,'image/svg+xml').documentElement;}}if(m.metadata.satellite)showPairPreview(`/api/maps/${m.id}/asset/${m.metadata.satellite}`);}
function showPairPreview(src){const doc=state.sourceSvg||new DOMParser().parseFromString(state.svgText,'image/svg+xml').documentElement;const vb=doc.getAttribute('viewBox')||'-2 17.68 964 924.64';const paths=[...doc.querySelectorAll('path,polygon,rect,circle')].filter(p=>!p.closest('defs,clipPath,mask,pattern,marker,symbol')).map(p=>{const c=p.cloneNode(true);c.setAttribute('fill','none');c.setAttribute('stroke','#f0a64c');c.setAttribute('stroke-width','1.5');c.setAttribute('vector-effect','non-scaling-stroke');return new XMLSerializer().serializeToString(c)}).join('');const [vx,vy,vw,vh]=vb.trim().split(/[ ,]+/).map(Number);$('pairPreview').innerHTML=`<svg id="pairSvg" viewBox="${vb}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><image id="pairImage" href="${src}" x="${vx}" y="${vy}" width="${vw}" height="${vh}" preserveAspectRatio="none" opacity="${state.alignment.opacity/100}"/><g id="pairImageTransform">${paths}</g></svg>`;syncAlign();}
$('satelliteFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{const r=isGithubLfsStorage?await uploadSatelliteToGithub(state.mapId,f):await api(`/api/maps/${state.mapId}/satellite`,{method:'POST',body:(()=>{const fd=new FormData();fd.append('satellite',f);return fd})()});state.metadata=r.metadata;await refreshMaps();showPairPreview(URL.createObjectURL(f));$('pairStatus').textContent='unverified';toast(isGithubLfsStorage?'Satellite image saved to GitHub LFS. Alignment is unverified.':'Satellite image uploaded. Alignment is unverified.')}catch(err){toast(err.message)}finally{e.target.value=''}});
function syncAlign(){state.alignment={opacity:+$('imageOpacity').value,scale:+$('imageScale').value,x:+$('imageX').value,y:+$('imageY').value};$('opacityValue').textContent=state.alignment.opacity+'%';$('scaleValue').textContent=state.alignment.scale+'%';$('xValue').textContent=state.alignment.x;$('yValue').textContent=state.alignment.y;const img=$('pairPreview').querySelector('#pairImage');if(img){img.setAttribute('opacity',state.alignment.opacity/100);const vb=($('pairSvg')?.getAttribute('viewBox')||'0 0 1000 600').trim().split(/[ ,]+/).map(Number);const cx=vb[0]+vb[2]/2,cy=vb[1]+vb[3]/2;img.setAttribute('transform',`translate(${state.alignment.x} ${state.alignment.y}) translate(${cx} ${cy}) scale(${state.alignment.scale/100}) translate(${-cx} ${-cy})`);}}
['imageOpacity','imageScale','imageX','imageY'].forEach(id=>$(id).addEventListener('input',syncAlign));$('resetAlignment').onclick=()=>{[['imageOpacity',55],['imageScale',100],['imageX',0],['imageY',0]].forEach(([id,v])=>$(id).value=v);syncAlign()};$('verifyPair').onclick=async()=>{try{const fd=new FormData();fd.append('verified','true');fd.append('notes',$('alignmentNotes').value);fd.append('scale',String(state.alignment.scale));fd.append('x',String(state.alignment.x));fd.append('y',String(state.alignment.y));fd.append('opacity',String(state.alignment.opacity));const headers=isGithubLfsStorage?{'X-Map-Upload-Key':requireMapUploadKey()}:{};const r=await api(`/api/maps/${state.mapId}/verify-pair`,{method:'POST',body:fd,headers});state.metadata=r.metadata;await refreshMaps();$('pairStatus').textContent='verified';toast('Pair metadata committed to GitHub. Alignment is marked verified.')}catch(e){toast(e.message)}};
$('changePairMap').onclick=()=>page('library');
const dialog=$('uploadDialog');$('openUpload').onclick=()=>dialog.showModal();$('closeUpload').onclick=$('cancelUpload').onclick=()=>dialog.close();
$('uploadForm').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target);try{if(isVercelPreview&&!isGithubLfsStorage)throw new Error('Map upload is disabled because GitHub Git LFS is not configured for this deployment.');const r=isGithubLfsStorage?await uploadNewMapToGithub(fd):await api('/api/maps',{method:'POST',body:fd});dialog.close();e.target.reset();state.mapId=r.map.id;await refreshMaps();toast(isGithubLfsStorage?'Map committed to GitHub Git LFS.':'Map uploaded to local library.');page('editor')}catch(err){toast(err.message)}});
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
$('startWorkflow').onclick=()=>page('library');$('newProject').onclick=$('newProject2').onclick=()=>{state.projectId=null;state.projectName=null;state.mapId=preferredMapId();page('library')};$('openUpload').addEventListener('click',()=>{});$('exportNav')?.addEventListener('click',()=>page('editor'));$('studioNav')?.addEventListener('click',()=>page('dashboard'));
init();
