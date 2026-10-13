// Performance guardrails. Each of these was a real cost that got fixed; the
// numbers are here so a future change cannot quietly put them back.
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';

let pass = 0, fail = 0;
const ok = (n, c, note = '') => { (c ? pass++ : fail++); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${note ? '  — ' + note : ''}`); };

const B = await launch({ port: 9380, profile: 'cdp-perf', url: 'http://localhost:4477/', scratch: path.join(import.meta.dirname, 'out-perf'), size: '1700,1050' });
try {
  await sleep(1800);
  await B.evaluate(`(async()=>{
    const b = await fetch('/test/fixtures/p1.jpg').then(r=>r.blob());
    await MF.addPhoto(b, { name: 'Subject' });
  })()`);
  await sleep(900);

  // An idle editor should not be asking for frames at all.
  const idle = await B.evaluate(`new Promise(res => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => { frames++; if (performance.now() - t0 < 700) requestAnimationFrame(tick); else res(frames); };
    requestAnimationFrame(tick);
  })`);
  const idleDraws = await B.evaluate(`(async () => {
    let n = 0;
    const real = MF.D.render;
    MF.D.render = (...a) => { n++; return real(...a); };
    await new Promise(r => setTimeout(r, 700));
    MF.D.render = real;
    return n;
  })()`);
  ok('idle costs nothing', idleDraws === 0, `${idleDraws} renders in 700ms (${idle} rAF ticks available)`);

  // Wheel-scaling used to rebuild the panel, re-rendering every look preview.
  await B.evaluate('MF.setTool("looks"); MF.paint()');
  await sleep(900);
  const wheel = await B.evaluate(`(() => {
    const panel = document.querySelector('#panel');
    const before = panel.querySelectorAll('canvas').length;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      MF.doc.layers[0].scale *= 1.01;
      MF.invalidate();
      MF.syncSliders();
    }
    return { ms: +((performance.now() - t0) / 20).toFixed(2), tiles: before };
  })()`);
  ok('scaling does not rebuild the preview wall', wheel.ms < 2,
    `${wheel.ms}ms per step with ${wheel.tiles} tiles on screen`);

  // Re-opening a tab should reuse cached tiles.
  const reopen = await B.evaluate(`(() => {
    const t = (tool) => { const a = performance.now(); MF.setTool(tool); return performance.now() - a; };
    t('looks'); t('export'); t('looks');       // warm
    const looks = t('looks'), exp = t('export'), bg = t('bg');
    return { looks: +looks.toFixed(2), exp: +exp.toFixed(2), bg: +bg.toFixed(2) };
  })()`);
  ok('switching tabs is instant', reopen.looks < 30 && reopen.exp < 30 && reopen.bg < 30,
    `looks ${reopen.looks}ms · export ${reopen.exp}ms · backdrop ${reopen.bg}ms`);

  // A drag frame: this is what smoothness actually means.
  const dragFrame = await B.evaluate(`(() => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 1200;
    const x = c.getContext('2d');
    const l = MF.doc.layers[0];
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) { l.x += 1; MF.D.render(x, MF.doc); }
    return +((performance.now() - t0) / 40).toFixed(2);
  })()`);
  ok('a drag frame stays well inside 16ms', dragFrame < 8, dragFrame + 'ms');

  const mem = await B.evaluate(`(() => {
    const m = performance.memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : -1;
  })()`);
  console.log(`      heap: ${mem}MB`);

  const errs = B.logs.filter(l => !/favicon|Deprecat/i.test(l));
  ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  B.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
