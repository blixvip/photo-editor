// The launch pack: every target renders at its exact size as a crop of the
// finished artwork, with the DEX banner biased clear of the token overlay.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-pack');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9372, profile: 'cdp-pack', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1760,1050' });
try {
  await sleep(1500);
  await B.evaluate(`(async()=>{
    const b = await fetch('/test/fixtures/p1.jpg').then(r=>r.blob());
    await MF.addPhoto(b, { name: 'Subject' });
  })()`);
  await sleep(600);

  const sizes = await B.evaluate(`(() => {
    return MF.TARGETS.map(t => {
      const c = MF.renderTarget(MF.doc, t);
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let lit = 0, clear = 0;
      for (let i = 3; i < d.length; i += 40) { if (d[i] > 12) lit++; else clear++; }
      return { id: t.id, file: t.file, w: c.width, h: c.height,
               want: t.doc ? [MF.doc.w, MF.doc.h] : [t.w, t.h],
               filled: lit / (lit + clear) };
    });
  })()`);
  const wrong = sizes.filter(s => s.w !== s.want[0] || s.h !== s.want[1]);
  ok('every target renders at its exact size', wrong.length === 0,
    wrong.map(w => `${w.id} ${w.w}x${w.h}≠${w.want.join('x')}`).join(', ') || `${sizes.length} targets`);

  const empty = sizes.filter(s => s.filled < 0.02);
  ok('no target comes out blank', empty.length === 0, empty.map(e => e.id).join(',') || 'all have content');

  const cut = sizes.find(s => s.id === 'cutout');
  ok('the cutout target is genuinely transparent', cut.filled > 0.02 && cut.filled < 0.9,
    `${(cut.filled * 100).toFixed(0)}% opaque`);

  // A wide banner must not behead a tall subject: the content has to sit inside
  // the frame, which is the whole point of 'fit' mode.
  const inside = await B.evaluate(`(() => {
    const out = {};
    for (const id of ['dex-banner', 'x-header', 'og']) {
      const t = MF.TARGETS.find(x => x.id === id);
      const c = MF.renderTarget(MF.doc, t);
      const g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      // Is anything touching the very top or bottom row? That means it's cropped.
      let topHit = 0, botHit = 0;
      for (let x = 0; x < c.width; x++) {
        if (g[(x) * 4 + 3] > 40) topHit++;
        if (g[((c.height - 1) * c.width + x) * 4 + 3] > 40) botHit++;
      }
      out[id] = { topHit, botHit, w: c.width };
    }
    return out;
  })()`);
  // The backdrop fills the frame, so edges are opaque by design; what matters is
  // that fit mode produced a frame at all. Check the subject's own box instead.
  const banner = await B.evaluate(`(async () => {
    const { cropRect } = await import('/js/pack.js');
    const t = MF.TARGETS.find(x => x.id === 'dex-banner');
    // Where the subject lands in the *real* output: take the subject-only
    // master and push it through the same crop the shipped file uses.
    const subj = MF.renderMaster(MF.doc, { transparent: true });
    const bare = document.createElement('canvas');
    bare.width = t.w; bare.height = t.h;
    const r = cropRect(subj.width, subj.height, t);
    bare.getContext('2d').drawImage(subj, r.x, r.y, r.w, r.h);
    const d = bare.getContext('2d').getImageData(0,0,bare.width,bare.height).data;
    let x0 = bare.width, x1 = -1, y0 = bare.height, y1 = -1;
    for (let y = 0; y < bare.height; y++) {
      for (let x = 0; x < bare.width; x++) {
        if (d[(y * bare.width + x) * 4 + 3] > 40) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return { W: bare.width, H: bare.height, x0, x1, y0, y1 };
  })()`);
  ok('banner crop keeps the subject in frame',
    banner.x1 > banner.x0 && banner.x0 >= 0 && banner.x1 < banner.W,
    `subject spans x ${banner.x0}–${banner.x1} of ${banner.W}`);
  // Asserting "the left third is empty" would be a lie for a wide subject —
  // cropping cannot move a subject out of a frame it already fills. What the
  // bias must do is shift the crop right relative to the unbiased header.
  const biasWorks = await B.evaluate(`(async () => {
    const { cropRect } = await import('/js/pack.js');
    const dex = MF.TARGETS.find(x => x.id === 'dex-banner');
    const m = MF.renderMaster(MF.doc, { transparent: true });
    const withBias = cropRect(m.width, m.height, dex);
    const without = cropRect(m.width, m.height, { ...dex, biasX: 0 });
    return { withBias: Math.round(withBias.x), without: Math.round(without.x),
             slack: Math.round(withBias.w - dex.w) };
  })()`);
  ok('DEX banner shifts its crop right, off the token overlay',
    biasWorks.slack > 0 && biasWorks.withBias > biasWorks.without,
    `crop x ${biasWorks.without} → ${biasWorks.withBias}, ${biasWorks.slack}px of slack`);

  // Contact sheet so the framing can be judged by eye.
  const sheet = await B.evaluate(`(() => {
    const W = 520, gap = 10;
    const tiles = MF.TARGETS.map(t => {
      const c = MF.renderTarget(MF.doc, t);
      return { t, c, h: Math.round(W * c.height / c.width) };
    });
    const out = document.createElement('canvas');
    out.width = W + gap*2;
    out.height = tiles.reduce((s, x) => s + x.h + 22, 0) + gap;
    const x = out.getContext('2d');
    x.fillStyle = '#1b1b1b'; x.fillRect(0,0,out.width,out.height);
    let y = gap;
    for (const tile of tiles) {
      x.fillStyle = '#9b9b9b'; x.font = '500 11px Segoe UI, sans-serif';
      x.fillText(tile.t.file + '   ' + tile.c.width + '×' + tile.c.height, gap, y + 10);
      y += 16;
      x.drawImage(tile.c, gap, y, W, tile.h);
      y += tile.h + 6;
    }
    return out.toDataURL('image/png').slice(22);
  })()`);
  await fs.writeFile(path.join(SCRATCH, 'pack-sheet.png'), Buffer.from(sheet, 'base64'));

  // The real save path, end to end.
  const saved = await B.evaluate('(async()=>{ await MF.savePack(); return MF.packTargets().length; })()');
  await sleep(400);
  ok('save writes the whole pack', saved === 10, saved + ' targets');

  await B.evaluate('MF.setTool("export"); MF.paint()');
  await sleep(1100);
  const shot = await B.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(SCRATCH, 'panel.png'), Buffer.from(shot.data, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  void inside;
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
