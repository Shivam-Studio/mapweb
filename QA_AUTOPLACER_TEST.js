'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('./frontend/autoplacer.js');

// Web Mercator origin and latitude clamping.
const origin = engine.mercator(0, 0);
assert.ok(Math.abs(origin[0]) < 1e-12 && Math.abs(origin[1]) < 1e-12, 'Mercator origin should be 0,0');
const north = engine.mercator(0, 90);
assert.ok(Number.isFinite(north[1]), 'Mercator must clamp the pole to a finite value');

// Equirectangular world crop maps geographic corners to the expected pixels.
const world = engine.geographicProjector({west:-180,south:-90,east:180,north:90}, 1920, 1080, 'EPSG:4326');
const center = world(0, 0);
assert.ok(Math.abs(center[0] - 960) < 1e-8 && Math.abs(center[1] - 540) < 1e-8, 'World center must map to canvas center');
const upperLeft = world(-180, 90);
assert.ok(Math.abs(upperLeft[0]) < 1e-8 && Math.abs(upperLeft[1]) < 1e-8, 'World NW corner must map to canvas origin');

// Web Mercator known crop maps its exact geographic corners to the canvas.
const merc = engine.geographicProjector({west:55,south:-2,east:105,north:42}, 1920, 1080, 'EPSG:3857');
const nw = merc(55,42), se = merc(105,-2);
assert.ok(Math.abs(nw[0]) < 1e-8 && Math.abs(nw[1]) < 1e-8, 'Mercator NW crop corner');
assert.ok(Math.abs(se[0]-1920) < 1e-8 && Math.abs(se[1]-1080) < 1e-8, 'Mercator SE crop corner');

// Three-point affine calibration exactly reproduces its control points and known transform.
const points = [
  {lon:70,lat:10,x:240,y:860},
  {lon:90,lat:10,x:640,y:860},
  {lon:70,lat:30,x:240,y:460}
];
const affine = engine.affineProjector(points, 'EPSG:4326');
for (const p of points) {
  const result = affine(p.lon,p.lat);
  assert.ok(Math.abs(result[0]-p.x) < 1e-7 && Math.abs(result[1]-p.y) < 1e-7, 'Affine projection must exactly fit control points');
}
const testPoint = affine(80,20);
assert.ok(Math.abs(testPoint[0]-440) < 1e-7 && Math.abs(testPoint[1]-660) < 1e-7, 'Affine interpolation should match the expected transform');

// Polygon and multipolygon to SVG conversion.
const polygon = {type:'Polygon',coordinates:[[[70,10],[80,10],[80,20],[70,20],[70,10]]]};
const d = engine.geometryToSvgPath(polygon,world);
assert.ok(d.startsWith('M') && d.endsWith('Z'), 'Polygon should produce a closed SVG path');
const multi = {type:'MultiPolygon',coordinates:[polygon.coordinates,polygon.coordinates]};
assert.equal((engine.geometryToSvgPath(multi,world).match(/M/g)||[]).length,2,'MultiPolygon should produce two paths');

// Release wiring.
const html = fs.readFileSync(path.join(__dirname,'frontend/index.html'),'utf8');
const app = fs.readFileSync(path.join(__dirname,'frontend/app.js'),'utf8');
assert.match(html,/data-page="autoplacer"/,'AutoPlacer navigation must be present');
assert.match(html,/id="page-autoplacer"/,'AutoPlacer workspace must be present');
assert.match(html,/id="apActiveGcp"/,'Calibration point picker must be present');
assert.match(html,/autoplacer\.js\?v=0\.8\.8/,'Geometry engine must be loaded before app.js');
assert.match(app,/api\.geographicProjector|geographicProjector/,'App must use the geographic projection engine');
assert.match(app,/apExportPackage/,'App must export a positioned state package');
assert.match(app,/function apPickCalibrationPoint/,'Unknown crops must support click-to-record image control points');
assert.match(app,/apShowCalibrationSetup/,'Incomplete calibration must show its setup state without enabling export');

// Click-to-record calibration points against the original reference-image pixel frame.
const vm = require('node:vm');
const appSource = fs.readFileSync(path.join(__dirname,'frontend/app.js'),'utf8');
function sliceFunction(startToken, endToken) {
  const start = appSource.indexOf(startToken);
  const end = appSource.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `Could not locate ${startToken}`);
  return appSource.slice(start, end);
}
const controls = {apActiveGcp:{value:'1'},apCropPreset:{value:'calibrate'},apPreviewStage:{querySelector:()=>null}};
for (let i=1;i<=3;i++) {
  controls[`apGcp${i}Lon`] = {value:String(70+i*5)};
  controls[`apGcp${i}Lat`] = {value:String(10+i*3)};
  controls[`apGcp${i}X`] = {value:''};
  controls[`apGcp${i}Y`] = {value:''};
}
const fakeImage = {getBoundingClientRect:()=>({left:100,top:100,width:960,height:540})};
let previewCalls = 0;
const sandbox = {
  $: id => controls[id] || {querySelector:()=>null},
  apReferenceUrl: 'blob:test-reference',
  apReadDimensions: () => ({width:1920,height:1080}),
  setApStatus: () => {},
  apRenderPreview: () => { previewCalls++; return Promise.resolve(); },
  Number, Math
};
vm.createContext(sandbox);
vm.runInContext(sliceFunction('function apCalibrationPointsComplete()', 'function apShowCalibrationSetup'), sandbox);
vm.runInContext(sliceFunction('function apPickCalibrationPoint(event)', 'async function initAutoPlacerPage'), sandbox);
function clickAt(x,y) {
  sandbox.apPickCalibrationPoint({clientX:x,clientY:y,target:{closest:()=>fakeImage}});
}
clickAt(580,370);
assert.equal(controls.apGcp1X.value,'960.0','First point X is measured in original image pixels');
assert.equal(controls.apGcp1Y.value,'540.0','First point Y is measured in original image pixels');
assert.equal(controls.apActiveGcp.value,'2','Picker advances to the next missing control point');
clickAt(340,235);
assert.equal(controls.apActiveGcp.value,'3','Picker advances through all three points');
clickAt(820,445);
assert.equal(previewCalls,1,'Completing the third point triggers the calibrated geographic preview');
assert.equal(controls.apGcp3X.value,'1440.0');

console.log('PASS: AutoPlacer projection, calibration, geometry, and UI wiring');
