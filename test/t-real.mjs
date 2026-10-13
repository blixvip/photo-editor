// Cut out real photographs and lay the results on a checkerboard, both models
// side by side. Thumbnails hide halos and chewed edges, so these come out at
// full size for eyeballing.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-real');
await fs.mkdir(SCRATCH, { recursive: true });

const B = await launch({ port: 9344, profile: 'cdp-real', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1400,900' });
try {
  await sleep(1400);
  await B.evaluate('MF.C.warm("fast").then(()=>1)');

  for (const f of ['p1.jpg', 'p2.jpg', 'p3.jpg']) {
    for (const model of ['fast', 'hq']) {
      const r = await B.evaluate(`(async () => {
        MF.doc.layers.length = 0; MF.doc.selected = null;
        const blob = await fetch('/test/fixtures/${f}').then(r => r.blob());
        await MF.addPhoto(blob, { name: '${f}', autoCut: false });
        const t = performance.now();
        await MF.cutout('${model}');
        const ms = Math.round(performance.now() - t);
        const l = MF.doc.layers[0];

        // Subject on a checkerboard at native size: any halo or hole shows.
        const bm = MF.D.layerBitmap(l);
        const out = document.createElement('canvas');
        out.width = bm.width; out.height = bm.height;
        const c = out.getContext('2d');
        const s = Math.max(12, Math.round(Math.min(bm.width,bm.height)/26));
        c.fillStyle = '#d8d8dc'; c.fillRect(0,0,out.width,out.height);
        c.fillStyle = '#f4f4f6';
        for (let y=0,r2=0;y<out.height;y+=s,r2++)
          for (let x=(r2%2?s:0);x<out.width;x+=s*2) c.fillRect(x,y,s,s);
        c.drawImage(bm, 0, 0);

        const md = l.mask.getContext('2d').getImageData(0,0,l.mask.width,l.mask.height).data;
        let fg=0, soft=0;
        for (let i=0;i<md.length;i+=4) { if (md[i]>200) fg++; else if (md[i]>40) soft++; }
        const n = md.length/4;
        return { ms, infer: l.rawMask.meta.ms, ep: l.rawMask.meta.ep,
                 kept: +(fg/n*100).toFixed(1), soft: +(soft/n*100).toFixed(2),
                 src: l.src.width + 'x' + l.src.height,
                 png: out.toDataURL('image/png').slice(22) };
      })()`);
      const name = `${f.replace('.jpg', '')}-${model}`;
      await fs.writeFile(path.join(SCRATCH, name + '.png'), Buffer.from(r.png, 'base64'));
      console.log(`${name.padEnd(12)} infer ${String(r.infer).padStart(5)}ms (${r.ep})  total ${String(r.ms).padStart(5)}ms  kept ${String(r.kept).padStart(5)}%  soft ${r.soft}%  trimmed to ${r.src}`);
    }
  }
  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  if (errs.length) console.log('\nCONSOLE:', errs.slice(0, 5).join('\n '));
} finally {
  B.close();
}
console.log('\n-> ' + SCRATCH);
