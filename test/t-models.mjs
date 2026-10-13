// Shoot-out between candidate segmentation models on real photos: speed, and
// how much of the mask lands in the mushy middle (ghosted background).
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-models');
await fs.mkdir(SCRATCH, { recursive: true });
const CANDIDATES = [
  ['u2netp', '/models/u2netp.onnx', 320, 'max'],
  ['silueta', '/models/silueta.onnx', 320, 'max'],
  ['u2net', '/models/u2net.onnx', 320, 'max'],
  ['rmbg-q', '/models/rmbg14-q.onnx', 1024, '255'],
];

const B = await launch({ port: 9346, profile: 'cdp-models', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1200,800' });
try {
  await sleep(1200);
  await B.evaluate(`window.__run = async (name, url, size, norm, photo) => {
    const ort = window.__ort || (window.__ort = await import('/vendor/ort/ort.webgpu.bundle.min.mjs'));
    ort.env.wasm.wasmPaths = '/vendor/ort/';
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8,(navigator.hardwareConcurrency||4)-1) : 1;
    ort.env.logLevel = 'error';
    window.__s = window.__s || {};
    if (!window.__s[name]) window.__s[name] = await ort.InferenceSession.create(url, { executionProviders:['wasm'], graphOptimizationLevel:'all' });
    const s = window.__s[name];

    const img = await createImageBitmap(await fetch(photo).then(r=>r.blob()));
    const sm = document.createElement('canvas'); sm.width = sm.height = size;
    const sc = sm.getContext('2d', { willReadFrequently:true });
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(img, 0, 0, size, size);
    const px = sc.getImageData(0,0,size,size).data;
    const n = size*size, t = new Float32Array(3*n);
    const mean = norm === '255' ? [.5,.5,.5] : [.485,.456,.406];
    const std  = norm === '255' ? [1,1,1]    : [.229,.224,.225];
    let max = 255;
    if (norm === 'max') { max = 1; for (let i=0;i<n;i++) for (let k=0;k<3;k++) if (px[i*4+k]>max) max = px[i*4+k]; }
    for (let i=0;i<n;i++) for (let k=0;k<3;k++) t[k*n+i] = (px[i*4+k]/max - mean[k]) / std[k];

    const t0 = performance.now();
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t, [1,3,size,size]) });
    const ms = Math.round(performance.now()-t0);
    const d = out[s.outputNames[0]].data;
    let lo=Infinity, hi=-Infinity;
    for (let i=0;i<d.length;i++) { if (d[i]<lo) lo=d[i]; if (d[i]>hi) hi=d[i]; }
    const span = hi-lo || 1;

    // Paint the mask over the photo on a checkerboard for the eyeball test.
    const mg = document.createElement('canvas'); mg.width = mg.height = size;
    const mc = mg.getContext('2d');
    const im = mc.createImageData(size,size);
    let fg=0, soft=0;
    for (let i=0;i<d.length;i++) {
      const v = (d[i]-lo)/span*255;
      im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v; im.data[i*4+3]=255;
      if (v>200) fg++; else if (v>40) soft++;
    }
    mc.putImageData(im,0,0);

    const W = img.width, H = img.height;
    const cut = document.createElement('canvas'); cut.width=W; cut.height=H;
    const cc = cut.getContext('2d');
    const sq = Math.max(10, Math.round(Math.min(W,H)/24));
    cc.fillStyle='#d8d8dc'; cc.fillRect(0,0,W,H);
    cc.fillStyle='#f4f4f6';
    for (let y=0,r=0;y<H;y+=sq,r++) for (let x=(r%2?sq:0);x<W;x+=sq*2) cc.fillRect(x,y,sq,sq);
    const sub = document.createElement('canvas'); sub.width=W; sub.height=H;
    const bc = sub.getContext('2d');
    bc.drawImage(img,0,0);
    const am = document.createElement('canvas'); am.width=am.height=size;
    const ac = am.getContext('2d', { willReadFrequently:true });
    ac.drawImage(mg,0,0);
    const ad = ac.getImageData(0,0,size,size);
    for (let i=0;i<ad.data.length;i+=4) { ad.data[i+3]=ad.data[i]; ad.data[i]=ad.data[i+1]=ad.data[i+2]=0; }
    ac.putImageData(ad,0,0);
    bc.globalCompositeOperation='destination-in';
    bc.imageSmoothingQuality='high';
    bc.drawImage(am,0,0,W,H);
    cc.drawImage(sub,0,0);
    img.close();
    return { ms, fg: +(fg/n*100).toFixed(1), soft: +(soft/n*100).toFixed(2), png: cut.toDataURL('image/png').slice(22) };
  }`);

  for (const photo of ['p1.jpg', 'p2.jpg', 'p3.jpg']) {
    for (const [name, url, size, norm] of CANDIDATES) {
      const r = await B.evaluate(`window.__run(${JSON.stringify(name)}, ${JSON.stringify(url)}, ${size}, ${JSON.stringify(norm)}, '/test/fixtures/${photo}')`);
      await fs.writeFile(path.join(SCRATCH, `${photo.replace('.jpg', '')}-${name}.png`), Buffer.from(r.png, 'base64'));
      console.log(`${photo} ${name.padEnd(8)} ${String(r.ms).padStart(6)}ms   solid ${String(r.fg).padStart(5)}%   ghosted ${r.soft}%`);
    }
    console.log('');
  }
} finally {
  B.close();
}
console.log('-> ' + SCRATCH);
