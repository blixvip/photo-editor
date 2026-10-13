// The layers dock and the move-it-quickly behaviours: stacking, blend, lock,
// visibility, stickers, snapping and nudge.
import fs from 'node:fs/promises';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

const SCRATCH = path.join(import.meta.dirname, 'out-layers');
await fs.mkdir(SCRATCH, { recursive: true });

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9367, profile: 'cdp-layers', url: 'http://localhost:4477/', scratch: SCRATCH, size: '1760,1050' });
try {
  await sleep(1500);
  await B.evaluate(`(async()=>{
    const blob = await fetch('/test/fixtures/p1.jpg').then(r=>r.blob());
    await MF.addPhoto(blob, { name:'Subject' });
  })()`);
  await sleep(400);

  await B.evaluate(`(() => { MF.D.addTextLayer(MF.doc, 'PUMP IT'); MF.addSticker('🚀'); MF.paint(); })()`);
  ok('dock lists every layer', (await B.evaluate('document.querySelectorAll("#layerList .lrow").length')) === 3);
  ok('dock lists top of stack first',
    await B.evaluate('document.querySelector("#layerList .lrow").dataset.id === String(MF.doc.layers[MF.doc.layers.length-1].id)'));

  const stack = await B.evaluate(`(() => {
    const ids = () => MF.doc.layers.map(l => l.id).join(',');
    const before = ids();
    const bottom = MF.doc.layers[0].id;
    MF.D.arrange(MF.doc, bottom, Infinity);
    const toFront = ids();
    MF.D.arrange(MF.doc, bottom, -Infinity);
    const back = ids();
    MF.D.arrange(MF.doc, MF.doc.layers[0].id, 1);
    const fwd = ids();
    MF.paint();
    return { before, toFront, back, fwd };
  })()`);
  ok('bring to front / send to back reorder the stack',
    stack.toFront !== stack.before && stack.back === stack.before && stack.fwd !== stack.before,
    `${stack.before} → ${stack.toFront} → ${stack.back}`);

  const blend = await B.evaluate(`(() => {
    const l = MF.doc.layers[MF.doc.layers.length-1];
    MF.doc.selected = l.id;
    const px = () => { const c = MF.exportCanvas(); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let s=0; for (let i=0;i<d.length;i+=400) s += d[i]+d[i+1]+d[i+2]; return s; };
    l.blend = 'normal'; const normal = px();
    l.blend = 'multiply'; const multiply = px();
    l.blend = 'screen'; const screen = px();
    l.blend = 'normal';
    return { normal, multiply, screen };
  })()`);
  ok('blend modes change the composite',
    blend.multiply !== blend.normal && blend.screen !== blend.normal && blend.screen > blend.multiply,
    `multiply<normal<screen brightness: ${blend.multiply} / ${blend.normal} / ${blend.screen}`);

  const vis = await B.evaluate(`(() => {
    const l = MF.doc.layers[MF.doc.layers.length-1];
    const px = () => { const c = MF.exportCanvas(); const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let s=0; for (let i=0;i<d.length;i+=400) s += d[i]+d[i+1]+d[i+2]; return s; };
    const on = px(); l.visible = false; const off = px(); l.visible = true;
    return { changed: on !== off };
  })()`);
  ok('hiding a layer removes it from the render', vis.changed);

  const lock = await B.evaluate(`(() => {
    const l = MF.doc.layers[MF.doc.layers.length-1];
    MF.doc.selected = l.id;
    l.locked = true;
    // hitLayer must skip it; nothing else is under the cursor at its centre
    const under = MF.hitLayerAt(l.x, l.y);
    l.locked = false;
    const unlocked = MF.hitLayerAt(l.x, l.y);
    return { lockedHit: under && under.id, unlockedHit: unlocked && unlocked.id, id: l.id };
  })()`);
  ok('a locked layer cannot be grabbed', lock.lockedHit !== lock.id && lock.unlockedHit === lock.id,
    JSON.stringify(lock));

  const snap = await B.evaluate(`(() => {
    const l = MF.doc.layers[MF.doc.layers.length-1];
    MF.doc.selected = l.id;
    l.x = MF.doc.w/2 + 3; l.y = MF.doc.h/2 - 2;
    MF.snapLayer(l);
    return { x: l.x, y: l.y, cx: MF.doc.w/2, cy: MF.doc.h/2, guides: MF.guides().length };
  })()`);
  ok('dragging snaps to the canvas centre',
    snap.x === snap.cx && snap.y === snap.cy && snap.guides === 2, JSON.stringify(snap));

  ok('stickers land as their own layer',
    await B.evaluate('MF.doc.layers.some(l => l.kind === "text" && l.text === "🚀")'));

  await B.evaluate('MF.setTool("looks"); MF.paint()');
  await sleep(900);
  const shot = await B.send('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(SCRATCH, 'dock.png'), Buffer.from(shot.data, 'base64'));

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed  ->  ${SCRATCH}`);
process.exit(fail ? 1 : 0);
