// Dependency-free camera framing regression tests for MVP 0.8.1.
const fs = require('fs');
const source = fs.readFileSync(__dirname + '/frontend/app.js', 'utf8');
const match = source.match(/function cameraViewBoxFromState\([\s\S]*?\n}\nfunction editorCameraViewBox/);
if (!match) throw new Error('cameraViewBoxFromState was not found');
const fnText = match[0].replace(/\nfunction editorCameraViewBox$/, '');
const formatViewBox = (x,y,w,h) => `${x} ${y} ${w} ${h}`;
eval(fnText.replace('function cameraViewBoxFromState', 'globalThis.cameraViewBoxFromState = function cameraViewBoxFromState'));
function parse(v){return v.split(/[ ,]+/).map(Number)}
function near(a,b,t=1e-6){return Math.abs(a-b)<=t}
function assert(condition,message){if(!condition)throw new Error(message)}
const base = parse(cameraViewBoxFromState('100 200 600 300',800,500,1,0,0));
assert(near(base[0],100)&&near(base[1],162.5)&&near(base[2],600)&&near(base[3],375),'Base camera frame should account for meet letterboxing');
const zoomed = parse(cameraViewBoxFromState('100 200 600 300',800,500,2,0,0));
assert(near(zoomed[2],300)&&near(zoomed[3],187.5)&&near(zoomed[0],250)&&near(zoomed[1],256.25),'2x zoom should halve the visible map rectangle around the centre');
const panned = parse(cameraViewBoxFromState('100 200 600 300',800,500,2,100,-50));
assert(near(panned[0],212.5)&&near(panned[1],275)&&near(panned[2],300)&&near(panned[3],187.5),'Pan should offset the camera in inverse screen space');
const portrait = parse(cameraViewBoxFromState('100 200 600 300',420,760,1,0,0));
assert(near(portrait[2],base[2]) && portrait[3] > base[3], 'Portrait viewport should preserve camera width and expand latitude through letterboxing, not switch to the world frame');
console.log(JSON.stringify({ok:true,base,zoomed,panned,portrait}));
