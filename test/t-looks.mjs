// The first-run experience: drop a photo, get a finished image and a wall of
// previews made from that same photo. Checks the previews are real renders and
// that clicking one lands the same result on the canvas.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-looks');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9365, profile: 'cdp-looks', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1700,1050' });
try {
  await sleep(1500);
  ok('opens on the Looks tab', (await B.evaluate('MF.S.tool')) === 'looks');

  const drop = await B.evaluate(`(async () => {
    const t = performance.now();
    const blob = await fetch('/test/fixtures/p1.jpg').then(r => r.blob());
    await MF.addPhoto(blob, { name: 'p1' });
    const l = MF.doc.layers[0];
    return { ms: Math.round(performance.now()-t), tool: MF.S.tool, look: MF.S.look,
             cut: !!l.cut, trimmed: !!l.untrimmed, aura: l.fx.aura, bg: MF.doc.bg.kind };
  })()`);
  ok('a dropped photo arrives finished', drop.cut && drop.aura > 0 && drop.bg === 'image',
    `${drop.ms}ms, look=${drop.look}`);
  ok('and it lands on the Looks tab', drop.tool === 'looks');

  // A subject that fills its photo is never trimmed. The finished look must not
  // depend on trimming having happened.
  const fullFrame = await B.evaluate(`(async () => {
    MF.doc.layers.length = 0; MF.doc.selected = null;
    MF.doc.bg = { kind: 'none' };
    const blob = await fetch('/test/fixtures/p3.jpg').then(r => r.blob());
    await MF.addPhoto(blob, { name: 'p3' });
    const l = MF.doc.layers[0];
    return { cut: !!l.cut, trimmed: !!l.untrimmed, aura: l.fx.aura, bg: MF.doc.bg.kind };
  })()`);
  ok('an untrimmed subject still gets the look',
    fullFrame.cut && fullFrame.aura > 0 && fullFrame.bg === 'image',
    JSON.stringify(fullFrame));

  // Previews must be real renders of this photo, not blank or identical tiles.
  const thumbs = await B.evaluate(`(async () => {
    const { LOOKS, drawLookThumb } = await import('/js/looks.js');
    const l = MF.doc.layers[0];
    const T = 104, sigs = [], blank = [];
    const t0 = performance.now();
    const sheet = document.createElement('canvas');
    const cols = 5, rows = Math.ceil(LOOKS.length/cols);
    sheet.width = cols*(T+10); sheet.height = rows*(T+26);
    const sx = sheet.getContext('2d');
    sx.fillStyle = '#0b0b0f'; sx.fillRect(0,0,sheet.width,sheet.height);
    for (let i = 0; i < LOOKS.length; i++) {
      const c = document.createElement('canvas'); c.width = c.height = T;
      drawLookThumb(c.getContext('2d'), T, l, LOOKS[i], 1);
      const d = c.getContext('2d').getImageData(0,0,T,T).data;
      let sum = 0, lit = 0;
      for (let p = 0; p < d.length; p += 4) { sum += d[p]*7 + d[p+1]*3 + d[p+2]; if (d[p+3] > 10) lit++; }
      sigs.push(sum);
      if (lit < T*T*0.4) blank.push(LOOKS[i].id);
      sx.drawImage(c, (i%cols)*(T+10)+5, Math.floor(i/cols)*(T+26)+5);
      sx.fillStyle = '#9a9ab0'; sx.font = '600 11px Segoe UI, sans-serif';
      sx.fillText(LOOKS[i].name, (i%cols)*(T+10)+5, Math.floor(i/cols)*(T+26)+T+18);
    }
    return { ms: Math.round((performance.now()-t0)/LOOKS.length), n: LOOKS.length,
             unique: new Set(sigs).size, blank, png: sheet.toDataURL('image/png').slice(22) };
  })()`);
  await fs.writeFile(path.join(SCRATCH, 'look-previews.png'), Buffer.from(thumbs.png, 'base64'));
  ok('every look previews without blanks', thumbs.blank.length === 0, thumbs.blank.join(',') || 'all drawn');
  ok('previews are all different', thumbs.unique === thumbs.n, `${thumbs.unique}/${thumbs.n} distinct`);
  ok('previews are cheap', thumbs.ms < 60, thumbs.ms + 'ms each');

  // Clicking a look must reproduce its preview on the real canvas.
  const applied = await B.evaluate(`(async () => {
    const { LOOKS } = await import('/js/looks.js');
    const out = [];
    for (const id of ['cyber', 'pump', 'cutout', 'gold']) {
      const k = LOOKS.find(x => x.id === id);
      await MF.pickLook(k);
      const l = MF.doc.layers[0];
      out.push({ id, aura: l.fx.aura, preset: l.fx.auraPreset, outline: l.fx.outline, bg: MF.doc.bg.kind,
                 bgId: MF.doc.bg.id || null });
    }
    return out;
  })()`);
  const by = Object.fromEntries(applied.map(a => [a.id, a]));
  ok('a preset-backdrop look applies', by.cyber.bg === 'preset' && by.cyber.bgId === 'grid-cyber' && by.cyber.aura > 0, JSON.stringify(by.cyber));
  ok('transparent look clears the backdrop', by.cutout.bg === 'none' && by.cutout.aura === 0, JSON.stringify(by.cutout));
  ok('switching looks clears the previous one', by.gold.outline === 0 && by.gold.bg === 'image', JSON.stringify(by.gold));

  await B.evaluate('MF.setTool("looks"); MF.paint()');
  await sleep(900);
  const shot = await B.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(SCRATCH, 'first-run.png'), Buffer.from(shot.data, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
