// One-time fetch of the runtime binaries.
//
// The ONNX runtime and the two segmentation models are ~106MB of immutable
// third-party bytes. They are deliberately not in git — a repo should not carry
// someone else's build artefacts — so this pulls them on first run. Everything
// after this works offline.
//
//   node setup.mjs            fetch anything missing
//   node setup.mjs --force    re-fetch even if present

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = import.meta.dirname;
const FORCE = process.argv.includes('--force');

const ORT = '1.23.0';
const ORT_BASE = `https://unpkg.com/onnxruntime-web@${ORT}/dist/`;
const MODEL_BASE = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/';

const FILES = [
  // The runtime entry point, plus every wasm build it may reach for: asyncify
  // for the WebGPU path, jsep and plain for the CPU paths.
  ...[
    'ort.webgpu.bundle.min.mjs',
    'ort-wasm-simd-threaded.asyncify.mjs',
    'ort-wasm-simd-threaded.asyncify.wasm',
    'ort-wasm-simd-threaded.jsep.mjs',
    'ort-wasm-simd-threaded.jsep.wasm',
    'ort-wasm-simd-threaded.mjs',
    'ort-wasm-simd-threaded.wasm',
  ].map(f => ({ url: ORT_BASE + f, to: path.join('vendor', 'ort', f) })),

  // Fast cutout (u2netp) and high-quality cutout (silueta). Both were picked by
  // measurement — see test/t-models.mjs.
  { url: MODEL_BASE + 'u2netp.onnx', to: path.join('models', 'u2netp.onnx'), min: 4e6 },
  { url: MODEL_BASE + 'silueta.onnx', to: path.join('models', 'silueta.onnx'), min: 4e7 },
];

// Test photographs, fetched rather than committed: they are third-party images
// and this repo has no business redistributing them.
if (process.argv.includes('--fixtures') || process.argv.includes('--all')) {
  for (const [id, w, h] of [[1005, 900, 1200], [64, 900, 1200], [237, 900, 1100]]) {
    const n = { 1005: 'p1', 64: 'p2', 237: 'p3' }[id];
    FILES.push({ url: `https://picsum.photos/id/${id}/${w}/${h}`, to: path.join('test', 'fixtures', n + '.jpg'), min: 2e4 });
  }
}

const MB = (n) => (n / 1048576).toFixed(1) + 'MB';

async function already(abs, min) {
  try {
    const st = await fs.stat(abs);
    return st.size > (min || 1000);
  } catch { return false; }
}

let fetched = 0, skipped = 0, failed = 0;

for (const f of FILES) {
  const abs = path.join(ROOT, f.to);
  if (!FORCE && await already(abs, f.min)) {
    skipped++;
    continue;
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  process.stdout.write(`  ${f.to.padEnd(52)}`);
  try {
    const res = await fetch(f.url, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (f.min && buf.length < f.min) throw new Error(`short read, ${MB(buf.length)}`);
    await fs.writeFile(abs, buf);
    console.log(MB(buf.length));
    fetched++;
  } catch (e) {
    console.log('FAILED — ' + e.message);
    failed++;
  }
}

console.log(`\n${fetched} fetched, ${skipped} already present${failed ? `, ${failed} FAILED` : ''}`);
if (failed) {
  console.log('Re-run `node setup.mjs` to retry just the missing files.');
  process.exit(1);
}
console.log('Ready. Start it with mf.cmd (or: node server.mjs) and open http://localhost:4477');
