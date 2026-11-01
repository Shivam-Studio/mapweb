const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const source = fs.readFileSync(require.resolve('./frontend/sha256.js'), 'utf8');
const context = { globalThis: {}, Uint8Array, Uint32Array, DataView, BigInt };
context.window = context.globalThis;
vm.createContext(context);
vm.runInContext(source, context);
const Sha256 = context.window.MapMotionSha256;
for (const sample of ['', 'abc', 'The quick brown fox jumps over the lazy dog']) {
  const bytes = Buffer.from(sample);
  const hash = new Sha256();
  hash.update(bytes.subarray(0, 2));
  hash.update(bytes.subarray(2));
  const actual = hash.hex();
  const expected = crypto.createHash('sha256').update(sample).digest('hex');
  if (actual !== expected) throw new Error(`SHA-256 mismatch for ${JSON.stringify(sample)}`);
}
const app = fs.readFileSync('./frontend/app.js', 'utf8');
if (!app.includes('uploadNewMapToGithub') || !app.includes('putFileToLfs') || !app.includes('satellite/upload-session')) {
  throw new Error('Direct Git LFS upload flow is missing from the browser application');
}
if (app.includes('VERCEL_UPLOAD_SAFE_BYTES')) throw new Error('Legacy 4 MB Vercel upload guard is still present');
console.log('PASS: incremental SHA-256 vectors and browser Git LFS upload wiring.');
