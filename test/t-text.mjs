// Fonts, text styling and colour markers: the faces really load and really
// render, presets change the result, alignment and line height do something,
// and the photo's own colours come back as swatches.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-text');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9376, profile: 'cdp-text', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1760,1050' });
try {
  await sleep(1800);

  const fonts = await B.evaluate(`(async () => {
    const n = await MF.loadFonts();
    const want = MF.FONTS.filter(f => f.file);
    // document.fonts.check is the honest question: can canvas draw with it now?
    const usable = want.filter(f => document.fonts.check('32px "' + f.name + '"'));
    return { loaded: n, want: want.length, usable: usable.length,
             missing: want.filter(f => !f.loaded).map(f => f.name) };
  })()`);
  ok('every bundled face loads', fonts.loaded === fonts.want,
    `${fonts.loaded}/${fonts.want}` + (fonts.missing.length ? ' missing ' + fonts.missing.join(',') : ''));
  ok('and the canvas can actually use them', fonts.usable === fonts.want, `${fonts.usable} usable`);

  // Different faces must produce visibly different pixels, not all fall back
  // to the same default — the classic silent webfont failure.
  const distinct = await B.evaluate(`(async () => {
    const { FONTS, familyOf } = await import('/js/fonts.js');
    const sigs = new Map();
    for (const f of FONTS.filter(x => x.cat)) {
      const c = document.createElement('canvas');
      c.width = 420; c.height = 90;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.font = '56px ' + familyOf(f.id);
      x.textBaseline = 'middle';
      x.fillText('Handgloves 123', 6, 45);
      const d = x.getImageData(0, 0, 420, 90).data;
      let s = 0, ink = 0;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 40) { ink++; s += i * d[i]; } }
      sigs.set(f.name, ink ? s % 1e9 : 0);
    }
    const vals = [...sigs.values()];
    return { n: vals.length, unique: new Set(vals).size, blank: [...sigs].filter(e => !e[1]).map(e => e[0]) };
  })()`);
  ok('each face renders differently', distinct.unique === distinct.n,
    `${distinct.unique}/${distinct.n} distinct`);
  ok('no face renders blank', distinct.blank.length === 0, distinct.blank.join(',') || 'all drew ink');

  // A styled text layer, through the app's own path.
  await B.evaluate(`(async()=>{
    const b = await fetch('/test/fixtures/p1.jpg').then(r=>r.blob());
    await MF.addPhoto(b, { name: 'Subject' });
  })()`);
  await sleep(600);

  const presets = await B.evaluate(`(() => {
    const t = MF.addStyledText('meme');
    t.text = 'PUMP IT';
    const sigOf = () => { MF.D.touch(t); const bm = MF.D.layerBitmap(t);
      return bm.width + 'x' + bm.height; };
    const out = {};
    for (const p of MF.TEXT_PRESETS) {
      const live = MF.D.getSelected(MF.doc);
      Object.assign(live, p.style);
      Object.assign(live.fx, p.fx);
      out[p.id] = sigOf();
    }
    return { sizes: out, n: MF.TEXT_PRESETS.length, unique: new Set(Object.values(out)).size };
  })()`);
  ok('text presets produce different renders', presets.unique > presets.n * 0.6,
    `${presets.unique}/${presets.n} distinct bitmap sizes`);

  const layout = await B.evaluate(`(() => {
    const t = MF.doc.layers.find(l => l.kind === 'text');
    t.text = 'ONE\\nTWO LONGER';
    t.font = 'anton'; t.caps = true; t.strokeW = 6;
    const h = (lh) => { t.lineH = lh; MF.D.touch(t); return MF.D.layerBitmap(t).height; };
    const tall = h(2.0), tight = h(0.8);
    t.lineH = 1.1;
    const ink = (al) => {
      t.align = al; MF.D.touch(t);
      const bm = MF.D.layerBitmap(t);
      const d = bm.getContext('2d').getImageData(0, 0, bm.width, bm.height).data;
      // centre of mass on x, for the first line only (top third)
      let sx = 0, n = 0;
      for (let y = 0; y < bm.height / 3; y++) {
        for (let x = 0; x < bm.width; x++) {
          if (d[(y * bm.width + x) * 4 + 3] > 60) { sx += x; n++; }
        }
      }
      return n ? sx / n / bm.width : 0.5;
    };
    return { tall, tight, left: ink('left'), centre: ink('center'), right: ink('right') };
  })()`);
  ok('line height changes the block height', layout.tall > layout.tight * 1.3,
    `${layout.tight}px → ${layout.tall}px`);
  ok('alignment moves the short line', layout.left < layout.centre - 0.02 && layout.right > layout.centre + 0.02,
    `first-line centre at ${layout.left.toFixed(2)} / ${layout.centre.toFixed(2)} / ${layout.right.toFixed(2)}`);

  const swatches = await B.evaluate(`(async () => {
    const { imageColors, CURATED } = await import('/js/swatches.js');
    const src = MF.doc.layers[0].untrimmed.src;
    const got = imageColors(src, 8);
    const valid = got.every(h => /^#[0-9a-f]{6}$/.test(h));
    const unique = new Set(got).size;
    return { got, valid, unique, curated: CURATED.length };
  })()`);
  ok('colour markers come out of your photo', swatches.got.length >= 4 && swatches.valid,
    swatches.got.join(' '));
  ok('and they are distinct', swatches.unique === swatches.got.length, `${swatches.unique} unique`);

  // Specimen sheet.
  const sheet = await B.evaluate(`(async () => {
    const { FONTS, familyOf, TEXT_PRESETS } = await import('/js/fonts.js');
    const faces = FONTS.filter(f => f.cat);
    const W = 760, rowH = 54;
    const c = document.createElement('canvas');
    c.width = W; c.height = (faces.length + TEXT_PRESETS.length) * rowH + 60;
    const x = c.getContext('2d');
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, c.width, c.height);
    let y = 34;
    x.fillStyle = '#9b9b9b'; x.font = '600 13px Segoe UI, sans-serif';
    x.fillText('FACES', 16, 20);
    for (const f of faces) {
      x.fillStyle = '#6f6f6f'; x.font = '400 10px Segoe UI, sans-serif';
      x.fillText(f.name, 16, y - 12);
      x.fillStyle = '#e3e3e3'; x.font = '34px ' + familyOf(f.id);
      x.fillText('Pump it to the moon 123', 16, y + 14);
      y += rowH;
    }
    x.fillStyle = '#9b9b9b'; x.font = '600 13px Segoe UI, sans-serif';
    y += 10; x.fillText('PRESETS', 16, y); y += 24;
    for (const p of TEXT_PRESETS) {
      x.font = '34px ' + familyOf(p.style.font);
      x.lineJoin = 'round';
      if (p.style.strokeW) {
        x.strokeStyle = p.style.stroke;
        x.lineWidth = (p.style.strokeW / 100) * 34;
        x.strokeText(p.sample + '  ' + p.name, 16, y + 14);
      }
      if (p.style.color !== 'transparent') { x.fillStyle = p.style.color; x.fillText(p.sample + '  ' + p.name, 16, y + 14); }
      y += rowH;
    }
    return c.toDataURL('image/png').slice(22);
  })()`);
  await fs.writeFile(path.join(SCRATCH, 'specimen.png'), Buffer.from(sheet, 'base64'));

  await B.evaluate('MF.setTool("text"); MF.paint()');
  await sleep(900);
  const shot = await B.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(SCRATCH, 'panel.png'), Buffer.from(shot.data, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
