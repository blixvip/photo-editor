// Backdrop adjustments: blur, pixelate and darken must work on every backdrop
// kind, survive switching backdrops, reach the export, and stay interactive.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-bgfx');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9374, profile: 'cdp-bgfx', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1760,1050' });
try {
  await sleep(1500);
  await B.evaluate(`(async()=>{
    const b = await fetch('/test/fixtures/p1.jpg').then(r=>r.blob());
    await MF.addPhoto(b, { name: 'Subject' });
  })()`);
  await sleep(600);

  // Measure a backdrop directly: neighbouring-pixel difference falls when it is
  // blurred, and *rises* in block structure when pixelated.
  const probe = await B.evaluate(`(async () => {
    const { backdropCanvas } = await import('/js/bgs.js');
    const W = 600, H = 600;
    const stats = (bg) => {
      const c = backdropCanvas(W, H, bg);
      const d = c.getContext('2d').getImageData(0,0,W,H).data;
      let edge = 0, lum = 0, n = 0;
      for (let y = 1; y < H; y += 3) {
        for (let x = 1; x < W; x += 3) {
          const i = (y*W+x)*4, j = (y*W+x-1)*4;
          edge += Math.abs(d[i]-d[j]) + Math.abs(d[i+1]-d[j+1]) + Math.abs(d[i+2]-d[j+2]);
          lum += d[i]*0.3 + d[i+1]*0.6 + d[i+2]*0.1;
          n++;
        }
      }
      return { edge: edge/n, lum: lum/n };
    };
    const out = {};
    for (const [name, base] of [
      ['preset', { kind:'preset', id:'stars-deep' }],
      ['solid',  { kind:'solid', color:'#884422' }],
      ['photo',  { kind:'image', img: MF.doc.layers[0].untrimmed.src }],
    ]) {
      out[name] = {
        plain:  stats(base),
        blur:   stats({ ...base, blur: 60 }),
        pixel:  stats({ ...base, pixel: 55 }),
        dim:    stats({ ...base, dim: 60 }),
      };
    }
    return out;
  })()`);

  for (const kind of ['preset', 'solid', 'photo']) {
    const p = probe[kind];
    if (kind === 'solid') {
      ok(`solid backdrop darkens`, p.dim.lum < p.plain.lum * 0.6,
        `luma ${p.plain.lum.toFixed(0)} → ${p.dim.lum.toFixed(0)}`);
      continue;
    }
    ok(`${kind} backdrop blurs`, p.blur.edge < p.plain.edge * 0.6,
      `edge energy ${p.plain.edge.toFixed(1)} → ${p.blur.edge.toFixed(1)}`);
    ok(`${kind} backdrop pixelates`, Math.abs(p.pixel.edge - p.plain.edge) > 0.5,
      `edge energy ${p.plain.edge.toFixed(1)} → ${p.pixel.edge.toFixed(1)}`);
    ok(`${kind} backdrop darkens`, p.dim.lum < p.plain.lum * 0.7,
      `luma ${p.plain.lum.toFixed(0)} → ${p.dim.lum.toFixed(0)}`);
  }

  // Settings must survive picking a different backdrop.
  const carried = await B.evaluate(`(() => {
    MF.doc.bg = { kind: 'preset', id: 'stars-deep', blur: 40, pixel: 30, dim: 25 };
    MF.setBackdrop({ kind: 'preset', id: 'grid-cyber' });
    const a = { ...MF.doc.bg };
    MF.setBackdrop({ kind: 'solid', color: '#334455' });
    const b = { ...MF.doc.bg };
    return { a: { id: a.id, blur: a.blur, pixel: a.pixel, dim: a.dim }, b: { blur: b.blur, pixel: b.pixel, dim: b.dim } };
  })()`);
  ok('settings carry across backdrop changes',
    carried.a.blur === 40 && carried.a.pixel === 30 && carried.a.dim === 25
    && carried.b.blur === 40 && carried.b.pixel === 30,
    JSON.stringify(carried));

  // And they must actually reach the exported file, not just the preview.
  const exported = await B.evaluate(`(() => {
    // Hide the layers first: the seated subject covers almost the whole canvas,
    // so measuring the composite would barely register a backdrop change.
    const vis = MF.doc.layers.map(l => l.visible);
    MF.doc.layers.forEach(l => { l.visible = false; });
    const lum = () => {
      const c = MF.exportCanvas();
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let s = 0, n = 0;
      for (let i = 0; i < d.length; i += 160) { s += d[i]; n++; }
      return s / n;
    };
    MF.doc.bg = { kind: 'preset', id: 'glow-solana', blur: 0, pixel: 0, dim: 0 };
    const plain = lum();
    MF.doc.bg = { ...MF.doc.bg, dim: 80 };
    const dark = lum();
    MF.doc.bg = { ...MF.doc.bg, dim: 0 };
    MF.doc.layers.forEach((l, i) => { l.visible = vis[i]; });
    MF.invalidate();
    return { plain, dark };
  })()`);
  ok('adjustments reach the export', exported.dark < exported.plain * 0.5,
    `${exported.plain.toFixed(0)} → ${exported.dark.toFixed(0)}`);

  // Caching: dragging a layer must not re-generate the backdrop every frame.
  const perf = await B.evaluate(`(async () => {
    const { backdropCanvas } = await import('/js/bgs.js');
    const bg = { kind: 'preset', id: 'stars-deep', blur: 45, pixel: 20 };
    const t0 = performance.now();
    backdropCanvas(1600, 1600, bg);
    const cold = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 30; i++) backdropCanvas(1600, 1600, bg);
    const warm = (performance.now() - t1) / 30;
    return { cold: Math.round(cold), warm: +warm.toFixed(3) };
  })()`);
  ok('backdrop is cached between frames', perf.warm < 1,
    `first build ${perf.cold}ms, cached ${perf.warm}ms`);

  // Contact sheet.
  const sheet = await B.evaluate(`(async () => {
    const { backdropCanvas } = await import('/js/bgs.js');
    const T = 260, rows = [
      ['stars-deep', { kind:'preset', id:'stars-deep' }],
      ['sun-vapor',  { kind:'preset', id:'sun-vapor' }],
      ['your photo', { kind:'image', img: MF.doc.layers[0].untrimmed.src }],
    ];
    const cols = [['plain',{}], ['blur 60',{blur:60}], ['pixelate 55',{pixel:55}], ['both + dark',{pixel:40,blur:25,dim:40}]];
    const out = document.createElement('canvas');
    out.width = cols.length*(T+8)+8; out.height = rows.length*(T+22)+8;
    const x = out.getContext('2d');
    x.fillStyle='#1b1b1b'; x.fillRect(0,0,out.width,out.height);
    rows.forEach(([rn, base], ri) => {
      cols.forEach(([cn, fx], ci) => {
        const c = backdropCanvas(T, T, { ...base, ...fx });
        x.drawImage(c, 8+ci*(T+8), 8+ri*(T+22)+16);
        x.fillStyle='#9b9b9b'; x.font='500 11px Segoe UI, sans-serif';
        x.fillText(ri===0 ? cn : (ci===0 ? rn : ''), 8+ci*(T+8), 8+ri*(T+22)+11);
      });
    });
    return out.toDataURL('image/png').slice(22);
  })()`);
  await fs.writeFile(path.join(SCRATCH, 'bgfx-sheet.png'), Buffer.from(sheet, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
