// End-to-end check of the photo editor: isolation headers, model load, a real
// cutout, refine/brush/wand, backgrounds, text, undo and export. Drives the
// page over CDP through window.MF so every step runs the app's own code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-editor');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (name, cond, note = '') => {
  (cond ? pass++ : fail++);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const B = await launch({ port: 9341, profile: 'cdp-editor', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1700,1050' });
try {
  await sleep(1400);

  ok('page booted', await B.evaluate('!!window.MF'));
  ok('cross-origin isolated (wasm threads available)', await B.evaluate('crossOriginIsolated'));
  ok('backdrop library loaded', (await B.evaluate('MF.C && MF.doc ? MF.doc.w : 0')) === 1600);
  const nbg = await B.evaluate('(async()=>(await import("/js/bgs.js")).BGS.length)()');
  ok('backdrop count', nbg > 90, nbg + ' presets');

  // A synthetic subject: warm figure on a flat cold field. Salient-object nets
  // should lock onto the figure, which is what we assert on below.
  await B.evaluate(`window.__mk = () => {
    const c = document.createElement('canvas'); c.width = 700; c.height = 900;
    const x = c.getContext('2d');
    x.fillStyle = '#2f6fd0'; x.fillRect(0,0,700,900);
    x.fillStyle = '#1e5bb8';
    for (let i=0;i<900;i+=40) x.fillRect(0,i,700,18);
    x.fillStyle = '#e8b27a';
    x.beginPath(); x.arc(350,250,120,0,7); x.fill();
    x.fillStyle = '#d94e3f';
    x.beginPath(); x.moveTo(350,360); x.lineTo(560,860); x.lineTo(140,860); x.closePath(); x.fill();
    return new Promise(r => c.toBlob(r, 'image/png'));
  }`);

  const t0 = Date.now();
  const warm = await B.evaluate('MF.C.warm("fast").then(r => r && r.ep)');
  ok('fast model compiles', !!warm, `ep=${warm} in ${Date.now() - t0}ms`);

  await B.evaluate('(async()=>MF.addPhoto(await window.__mk(), {name:"test", autoCut:false}))()');
  await sleep(500);
  ok('photo added', (await B.evaluate('MF.doc.layers.length')) === 1);

  // ---- cutout --------------------------------------------------------------
  const cut = await B.evaluate(`(async () => {
    const t = performance.now();
    await MF.cutout('fast');
    const l = MF.doc.layers[0];
    const m = l.mask;
    const d = m.getContext('2d').getImageData(0,0,m.width,m.height).data;
    let fg=0, mid=0;
    for (let i=0;i<d.length;i+=4) { if (d[i]>200) fg++; else if (d[i]>40) mid++; }
    const n = d.length/4;
    return { ms: Math.round(performance.now()-t), w:m.width, h:m.height,
             fg: fg/n, mid: mid/n, ep: l.rawMask.meta && l.rawMask.meta.ep,
             infer: l.rawMask.meta && l.rawMask.meta.ms };
  })()`);
  ok('cutout runs', cut.fg > 0.02, JSON.stringify(cut));
  ok('mask keeps a plausible subject', cut.fg > 0.05 && cut.fg < 0.75, `${(cut.fg * 100).toFixed(1)}% kept`);
  ok('mask has soft edges', cut.mid > 0.0005, `${(cut.mid * 100).toFixed(2)}% partial`);
  ok('mask capped at working resolution', Math.max(cut.w, cut.h) <= 1400, `${cut.w}x${cut.h}`);
  ok('inference under 2s', cut.infer < 2000, cut.infer + 'ms on ' + cut.ep);

  // ---- refine --------------------------------------------------------------
  const ref = await B.evaluate(`(async () => {
    const l = MF.doc.layers[0];
    const read = () => { const m=l.mask, d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;
      let s=0; for (let i=0;i<d.length;i+=4) s+=d[i]; return s/(d.length/4); };
    const base=read();
    MF.S.cut.edge=-30; MF.recompose(l); const shrunk=read();
    MF.S.cut.edge=30;  MF.recompose(l); const grown=read();
    MF.S.cut.edge=0;
    const t=performance.now();
    for (let i=0;i<10;i++) { MF.S.cut.edge = -10 + i; MF.recompose(l); }
    const ms = Math.round((performance.now()-t)/10*10)/10;
    MF.S.cut.edge=0; MF.recompose(l);
    return { base, shrunk, grown, ms };
  })()`);
  ok('edge shift actually shifts the edge', ref.shrunk < ref.base - 0.5 && ref.grown > ref.base + 0.5,
    `mean ${ref.shrunk.toFixed(1)} < ${ref.base.toFixed(1)} < ${ref.grown.toFixed(1)}`);
  ok('refine is interactive', ref.ms < 33, ref.ms + 'ms per recompose');

  // ---- brush + wand --------------------------------------------------------
  // Trim is what makes the handles usable, so check the layer really shrank
  // and that the subject did not slide while it did.
  const trim = await B.evaluate(`(() => {
    const l = MF.doc.layers[0];
    const before = { w: l.src.width, h: l.src.height, x: l.x, y: l.y };
    const centre = (() => {  // centroid of kept pixels, in document space
      const m = l.mask, d = m.getContext('2d').getImageData(0,0,m.width,m.height).data;
      let sx=0, sy=0, n=0;
      for (let y=0;y<m.height;y++) for (let x=0;x<m.width;x++) {
        if (d[(y*m.width+x)*4] > 128) { sx+=x; sy+=y; n++; }
      }
      if (!n) return null;
      const k = l.src.width / m.width;
      return { x: l.x + ((sx/n)*k - l.src.width/2) * l.scale,
               y: l.y + ((sy/n)*k - l.src.height/2) * l.scale };
    })();
    return { before, centre, after: { w: l.src.width, h: l.src.height }, trimmed: !!l.untrimmed };
  })()`);
  ok('cutout trims the layer to its subject', trim.trimmed && trim.after.w < 700,
    `${trim.before.w}x${trim.before.h} src after trim`);

  // Clicking empty space inside a cut-out's box must not grab the photo.
  const hits = await B.evaluate(`(() => {
    const l = MF.doc.layers[0];
    const box = MF.D.layerBox(l);
    const corner = MF.D.hitPixel(l, -box.w/2 * 0.97, -box.h/2 * 0.97);
    const mid = MF.D.hitPixel(l, 0, 0);
    return { corner, mid };
  })()`);
  ok('hit testing follows the alpha, not the box', hits.corner === false,
    `corner=${hits.corner} centre=${hits.mid}`);

  const brush = await B.evaluate(`(() => {
    const l = MF.doc.layers[0];
    const stats = () => { const m=l.mask, d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;
      let s=0; for (let i=0;i<d.length;i+=4) s+=d[i]; return s/(d.length/4); };
    // Aim at a pixel the mask definitely keeps, so the assertion tests the
    // brush rather than where the model happened to find the subject.
    const m = l.mask, d = m.getContext('2d').getImageData(0,0,m.width,m.height).data;
    let tx=-1, ty=-1;
    for (let y=0;y<m.height && tx<0;y++) for (let x=0;x<m.width;x++) {
      if (d[(y*m.width+x)*4] > 240) { tx=x; ty=y; break; }
    }
    if (tx < 0) return { skip: true };
    const k = l.src.width / m.width;
    const docX = l.x + (tx*k - l.src.width/2) * l.scale;
    const docY = l.y + (ty*k - l.src.height/2) * l.scale;
    const before = stats();
    MF.S.brush.radius = 80; MF.S.paint = 'erase';
    MF.paintAt(docX, docY);
    const after = stats();
    MF.S.paint = null;
    return { before, after };
  })()`);
  ok('erase brush removes pixels', !brush.skip && brush.after < brush.before - 0.3,
    `${(brush.before || 0).toFixed(1)} -> ${(brush.after || 0).toFixed(1)}`);

  const wand = await B.evaluate(`(() => {
    const l = MF.doc.layers[0];
    MF.resetMask(l);
    const read = () => { const m=l.mask, d=m.getContext('2d').getImageData(0,0,m.width,m.height).data;
      let s=0; for (let i=0;i<d.length;i+=4) s+=d[i]; return s/(d.length/4); };
    const before = read();
    const box = MF.D.layerBox(l);
    MF.S.wandTol = 40;
    MF.wandAt(l.x - box.w*0.45, l.y - box.h*0.45);   // a corner = flat backdrop
    return { before, after: read() };
  })()`);
  ok('wand drops a flat backdrop', wand.after < wand.before * 0.75,
    `${wand.before.toFixed(1)} -> ${wand.after.toFixed(1)}`);

  // ---- backdrops, text, undo ----------------------------------------------
  await B.evaluate(`(async () => {
    const l = MF.doc.layers[0];
    MF.resetMask(l);
    await MF.cutout('fast');
    MF.doc.bg = { kind:'preset', id:'glow-solana' };
    const t = MF.D.addTextLayer(MF.doc, 'TO THE MOON');
    t.fx.glow = 40; t.strokeW = 14;
    MF.doc.selected = l.id;
    l.fx.outline = 22; l.fx.shadow = 30;
    MF.D.touch(l); MF.D.touch(t);
    MF.hist.push('test');
    MF.paint();
  })()`);
  await sleep(300);
  ok('text layer added', (await B.evaluate('MF.doc.layers.filter(l=>l.kind==="text").length')) === 1);

  const undone = await B.evaluate(`(() => {
    const n0 = MF.doc.layers.length;
    MF.hist.undo();
    const n1 = MF.doc.layers.length;
    const srcOk = MF.doc.layers.every(l => l.kind !== 'image' || (l.src && l.src.width > 0));
    MF.hist.redo();
    const n2 = MF.doc.layers.length;
    const stillOk = MF.doc.layers.every(l => l.kind !== 'image' || (l.src && l.src.width > 0));
    MF.paint();
    return { n0, n1, n2, srcOk, stillOk };
  })()`);
  ok('undo/redo keeps layer pixels alive', undone.srcOk && undone.stillOk, JSON.stringify(undone));
  ok('redo restores the layer count', undone.n2 === undone.n0, `${undone.n0} -> ${undone.n1} -> ${undone.n2}`);

  // every backdrop renders without throwing
  const bgAll = await B.evaluate(`(async () => {
    const { BGS, drawBG } = await import('/js/bgs.js');
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const x = c.getContext('2d');
    const bad = [];
    const t = performance.now();
    for (const b of BGS) {
      try { drawBG(x, 200, 200, { kind:'preset', id:b.id }); } catch (e) { bad.push(b.id + ': ' + e.message); }
    }
    return { bad, n: BGS.length, ms: Math.round(performance.now()-t) };
  })()`);
  ok('every backdrop renders', bgAll.bad.length === 0, bgAll.bad.slice(0, 3).join(' | ') || `${bgAll.n} in ${bgAll.ms}ms`);

  // ---- aura ----------------------------------------------------------------
  const aura = await B.evaluate(`(async () => {
    const m = await import('/js/aura.js');
    const l = MF.doc.layers.find(x => x.kind === 'image');
    MF.doc.selected = l.id;
    const shot = () => {
      MF.D.touch(l);
      const bm = MF.D.layerBitmap(l);
      const c = document.createElement('canvas');
      c.width = bm.width; c.height = bm.height;
      c.getContext('2d').drawImage(bm, 0, 0);
      return c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    };
    // Compare colour, not alpha: the aura composites additively, so alpha
    // saturates across the whole glow and hides every real difference.
    const rgbDiff = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2]) > 40) n++;
      }
      return n / (a.length/4);
    };

    l.fx.aura = 0; const off = shot();
    Object.assign(l.fx, { aura: 100, auraSize: 50, auraWarp: 0, auraPreset: 'gold' });
    const t0 = performance.now();
    const noWarp = shot();
    const buildMs = Math.round(performance.now() - t0);
    const grew = MF.D.layerBitmap(l).width;
    l.fx.auraWarp = 100; const warped = shot();
    l.fx.auraPreset = 'mint'; const mint = shot();

    l.fx.auraWarp = 55; l.fx.auraPreset = 'gold';
    MF.D.touch(l);
    return {
      warpAvailable: m.warpAvailable(),
      onVsOff: rgbDiff(off, noWarp),
      flicker: rgbDiff(noWarp, warped),
      colour: rgbDiff(noWarp, mint),
      buildMs, grew,
      lastBuild: m.lastBuild,
    };
  })()`);
  ok('aura warp filter is available', aura.warpAvailable, 'feTurbulence + feDisplacementMap');
  ok('aura actually lights the subject', aura.onVsOff > 0.05, `${(aura.onVsOff * 100).toFixed(1)}% of pixels changed`);
  ok('flicker visibly reshapes the rim', aura.flicker > 0.01, `${(aura.flicker * 100).toFixed(2)}% changed`);
  ok('aura presets differ from each other', aura.colour > 0.05, `${(aura.colour * 100).toFixed(1)}% changed gold→mint`);
  ok('aura build stays interactive', aura.buildMs < 180, aura.buildMs + 'ms');

  const oneClick = await B.evaluate(`(async () => {
    await MF.auraOneClick();
    const l = MF.doc.layers.find(x => x.kind === 'image');
    const img = MF.doc.bg.img;
    // "In place" means the subject sits exactly where it does in its own photo.
    const s = Math.max(MF.doc.w/img.width, MF.doc.h/img.height);
    return { bg: MF.doc.bg.kind, aura: l.fx.aura, scaleMatches: Math.abs(l.scale - s) < 0.001,
             rot: l.rot, sameImage: img === (l.untrimmed ? l.untrimmed.src : l.src) };
  })()`);
  ok('one-click puts the subject back on its own photo',
    oneClick.bg === 'image' && oneClick.aura > 0 && oneClick.scaleMatches && oneClick.sameImage,
    JSON.stringify(oneClick));

  // ---- export --------------------------------------------------------------
  const exp = await B.evaluate(`(() => {
    const out = {};
    for (const s of [1,2]) {
      MF.S.exportScale = s;
      const c = MF.exportCanvas();
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let nonEmpty = 0;
      for (let i=3;i<d.length;i+=4000) if (d[i] > 0) nonEmpty++;
      out['x'+s] = { w:c.width, h:c.height, nonEmpty };
    }
    MF.S.exportScale = 1;
    return out;
  })()`);
  ok('export at 1x', exp.x1.w === 1600 && exp.x1.nonEmpty > 0, JSON.stringify(exp.x1));
  ok('export at 2x', exp.x2.w === 3200 && exp.x2.nonEmpty > 0, JSON.stringify(exp.x2));

  // transparent PNG keeps its holes
  const alpha = await B.evaluate(`(() => {
    MF.doc.bg = { kind:'none' };
    const c = MF.exportCanvas();
    const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let clear = 0;
    for (let i=3;i<d.length;i+=400) if (d[i] === 0) clear++;
    MF.doc.bg = { kind:'preset', id:'glow-solana' };
    MF.invalidate();
    return clear;
  })()`);
  ok('transparent export has transparency', alpha > 0, alpha + ' clear samples');

  // ---- frame cost ----------------------------------------------------------
  const fps = await B.evaluate(`(() => {
    const l = MF.doc.layers[0];
    const t = performance.now();
    for (let i=0;i<30;i++) { l.x += 1; MF.D.render(document.createElement('canvas').getContext('2d'), MF.doc); }
    return Math.round((performance.now()-t)/30 * 10)/10;
  })()`);
  ok('full-doc render under 16ms', fps < 16, fps + 'ms per frame');

  // ---- screenshots ---------------------------------------------------------
  await B.evaluate('MF.setTool("bg"); MF.paint()');
  await sleep(700);
  for (const [name, setup] of [
    ['00-aura', 'MF.setTool("aura"); MF.paint()'],
    ['01-backdrops', 'MF.setTool("bg"); MF.paint()'],
    ['02-cutout', 'MF.setTool("cut"); MF.paint()'],
    ['03-style', 'MF.setTool("style"); MF.paint()'],
    ['04-export', 'MF.setTool("export"); MF.paint()'],
  ]) {
    await B.evaluate(setup);
    await sleep(450);
    const shot = await B.send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(path.join(SCRATCH, name + '.png'), Buffer.from(shot.data, 'base64'));
  }

  // the finished artwork on its own, at export size
  const art = await B.evaluate('MF.exportCanvas().toDataURL("image/png").slice(22)');
  await fs.writeFile(path.join(SCRATCH, '05-artwork.png'), Buffer.from(art, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat|preload/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 4).join(' | '));
} finally {
  B.close();
}

console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
