// Render the aura on real photos, at export size, so the rim can be judged by
// eye rather than by a slider value.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-aura');
await fs.mkdir(SCRATCH, { recursive: true });

const B = await launch({ port: 9348, profile: 'cdp-aura', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1700,1050' });
try {
  await sleep(1400);
  const warp = await B.evaluate(`(async()=>{const a=await import('/js/aura.js');
    const c=document.createElement('canvas');c.width=c.height=8;
    return typeof a.buildAura === 'function';})()`);
  console.log('aura module loads:', warp);

  for (const f of ['p3.jpg', 'p1.jpg']) {
    const r = await B.evaluate(`(async () => {
      MF.doc.layers.length = 0; MF.doc.selected = null;
      MF.doc.bg = { kind:'preset', id:'glow-solana' };
      const blob = await fetch('/test/fixtures/${f}').then(r => r.blob());
      await MF.addPhoto(blob, { name: '${f}', autoCut: false });
      const t0 = performance.now();
      await MF.auraOneClick();
      const total = Math.round(performance.now() - t0);
      const l = MF.doc.layers[0];
      const t1 = performance.now();
      MF.D.touch(l); MF.D.layerBitmap(l);
      const rebuild = Math.round(performance.now() - t1);
      return { total, rebuild, fx: { ...l.fx }, bg: MF.doc.bg.kind,
               png: MF.exportCanvas().toDataURL('image/png').slice(22) };
    })()`);
    await fs.writeFile(path.join(SCRATCH, f.replace('.jpg', '') + '-gold.png'), Buffer.from(r.png, 'base64'));
    console.log(`${f}  one-click ${r.total}ms   aura rebuild ${r.rebuild}ms   bg=${r.bg}   strength=${r.fx.aura} size=${r.fx.auraSize} flicker=${r.fx.auraWarp}`);
  }

  // Every preset on one subject, so a bad palette can't hide.
  const sheet = await B.evaluate(`(async () => {
    const { AURA_PRESETS } = await import('/js/aura.js');
    const l = MF.doc.layers[0];
    const N = AURA_PRESETS.length, cols = 4, rows = Math.ceil(N/cols), S = 420;
    const out = document.createElement('canvas');
    out.width = cols*S; out.height = rows*S;
    const c = out.getContext('2d');
    c.fillStyle = '#07070c'; c.fillRect(0,0,out.width,out.height);
    const t0 = performance.now();
    for (let i=0;i<N;i++) {
      l.fx.auraPreset = AURA_PRESETS[i].id;
      MF.D.touch(l);
      const bm = MF.D.layerBitmap(l);
      const s = Math.min(S*0.82/bm.width, S*0.82/bm.height);
      c.drawImage(bm, (i%cols)*S + (S-bm.width*s)/2, Math.floor(i/cols)*S + (S-bm.height*s)/2, bm.width*s, bm.height*s);
      c.fillStyle = '#9a9ab0';
      c.font = '600 15px Segoe UI, sans-serif';
      c.fillText(AURA_PRESETS[i].name, (i%cols)*S + 14, Math.floor(i/cols)*S + S - 14);
    }
    const ms = Math.round((performance.now()-t0)/N);
    l.fx.auraPreset = 'gold'; MF.D.touch(l); MF.invalidate();
    return { ms, png: out.toDataURL('image/png').slice(22) };
  })()`);
  await fs.writeFile(path.join(SCRATCH, 'presets.png'), Buffer.from(sheet.png, 'base64'));
  console.log(`presets sheet: ${sheet.ms}ms per aura build`);

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  if (errs.length) console.log('CONSOLE:\n ' + errs.slice(0, 5).join('\n '));
} finally {
  B.close();
}
console.log('-> ' + SCRATCH);
