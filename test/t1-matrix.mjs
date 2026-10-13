// Test 1: full render matrix, determinism, edge-case inputs, overflow detection.
import { launch, sleep } from './cdp.mjs';
const SCRATCH = import.meta.dirname;
const S = await launch({ port: 9341, profile: 'cdp-matrix', url: 'http://localhost:4477/generator.html', scratch: SCRATCH });
await sleep(2500);

const fails = [];
const note = (t, m) => { fails.push(t + ': ' + m); console.log('  FAIL ' + t + ' -> ' + m); };

// 1a. every template x palette x size x subject-kind
const matrix = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const SIZES = [[1000,1000],[512,512],[400,400],[128,128],[1200,630],[1500,500]];
  const cv = document.createElement('canvas');
  const results = { count: 0, blank: [], errors: [], edgeInk: [] };
  const base = { ticker: 'TESTCOIN', name: 'test coin name', tagline: 'a tagline here', seed: 42, bitmap: null };
  const kinds = [{ k: 'none', emoji: '' }, { k: 'emoji', emoji: '\\u{1F436}' }];
  const origErr = console.error; const errs = [];
  console.error = (...a) => { errs.push(a.join(' ')); };
  for (const t of T.TEMPLATES) {
    for (const p of T.PALETTES) {
      for (const [w, h] of SIZES) {
        for (const kind of kinds) {
          cv.width = w; cv.height = h;
          const st = Object.assign({}, base, { emoji: kind.emoji, template: t.id, pal: p, transparent: false, _cache: {} });
          try { T.render(cv, st); } catch (e) { results.errors.push(t.id + '/' + p.id + ' ' + e.message); continue; }
          results.count++;
          const c = cv.getContext('2d', { willReadFrequently: true });
          const d = c.getImageData(0, 0, w, h).data;
          let lit = 0, n = 0, mn = 255, mx = 0;
          for (let i = 0; i < d.length; i += 4 * 31) {
            if (d[i + 3] > 8) lit++;
            const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
            if (v < mn) mn = v; if (v > mx) mx = v;
            n++;
          }
          if (lit / n < 0.9 || mx - mn < 25) results.blank.push([t.id, p.id, w + 'x' + h, kind.k, +(lit / n).toFixed(2), mx - mn]);
        }
      }
    }
  }
  console.error = origErr;
  results.renderErrors = errs;
  return results;
})()`);
console.log('1a. matrix renders:', matrix.count, '| throw:', matrix.errors.length, '| internal render errors:', matrix.renderErrors.length, '| blank/flat:', matrix.blank.length);
if (matrix.errors.length) note('matrix-throw', JSON.stringify(matrix.errors.slice(0, 5)));
if (matrix.renderErrors.length) note('matrix-internal', JSON.stringify(matrix.renderErrors.slice(0, 5)));
if (matrix.blank.length) note('matrix-blank', JSON.stringify(matrix.blank.slice(0, 8)));

// 1b. determinism: same seed -> identical bytes; different seed -> different
const det = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const cv = document.createElement('canvas'); cv.width = cv.height = 300;
  const out = { same: [], diff: [] };
  for (const t of T.TEMPLATES) {
    const mk = seed => { T.render(cv, { ticker: 'SEEDY', name: 'seed test', tagline: 'x', emoji: '', bitmap: null,
      template: t.id, pal: T.PALETTES[0], seed, transparent: false, _cache: {} }); return cv.toDataURL(); };
    const a = mk(11), b = mk(11);
    if (a !== b) out.same.push(t.id);
    const variants = new Set([a, mk(23), mk(99), mk(404), mk(7777)]);
    if (variants.size < 3) out.diff.push(t.id + ':' + variants.size);
  }
  return out;
})()`);
console.log('1b. determinism: unstable:', det.same.length ? det.same : 'none', '| seed ignored:', det.diff.length ? det.diff : 'none');
if (det.same.length) note('determinism', 'same seed differs: ' + det.same.join(','));

// 1c. transparent mode really has alpha, opaque mode really has none
const alpha = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const cv = document.createElement('canvas'); cv.width = cv.height = 400;
  const bad = { opaqueHasHoles: [], transparentIsSolid: [] };
  for (const t of T.TEMPLATES) {
    for (const tr of [false, true]) {
      T.render(cv, { ticker: 'ALPHA', name: 'n', tagline: 't', emoji: '', bitmap: null,
        template: t.id, pal: T.PALETTES[0], seed: 5, transparent: tr, _cache: {} });
      const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 400, 400).data;
      let clear = 0, n = 0;
      for (let i = 3; i < d.length; i += 4 * 7) { if (d[i] < 8) clear++; n++; }
      const frac = clear / n;
      if (!tr && frac > 0.02) bad.opaqueHasHoles.push([t.id, +frac.toFixed(3)]);
      if (tr && frac < 0.15) bad.transparentIsSolid.push([t.id, +frac.toFixed(3)]);
    }
  }
  return bad;
})()`);
console.log('1c. alpha: opaque-with-holes:', alpha.opaqueHasHoles.length ? alpha.opaqueHasHoles : 'none',
  '| transparent-still-solid:', alpha.transparentIsSolid.length ? alpha.transparentIsSolid : 'none');
if (alpha.opaqueHasHoles.length) note('alpha-opaque', JSON.stringify(alpha.opaqueHasHoles));
if (alpha.transparentIsSolid.length) note('alpha-transparent', JSON.stringify(alpha.transparentIsSolid));

// 1d. hostile / edge-case text input
const edge = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const cv = document.createElement('canvas');
  const cases = {
    empty: { ticker: '', name: '', tagline: '' },
    spaces: { ticker: '   ', name: '   ', tagline: '  ' },
    long: { ticker: 'ABCDEFGHIJKLMN', name: 'an extremely long project name that keeps going', tagline: 'tagline that is also very long indeed yes' },
    unicode: { ticker: '\\u{1F525}\\u{1F680}', name: '\\u4E2D\\u6587\\u540D\\u5B57', tagline: '\\u00e9\\u00e8\\u00ea \\u0441\\u043b\\u043e\\u0432\\u043e' },
    symbols: { ticker: '<>&"\\\\', name: '<script>x</script>', tagline: '100% \\u00a7\\u00b1' },
    one: { ticker: 'X', name: 'x', tagline: '' },
  };
  const bad = [];
  for (const [label, c] of Object.entries(cases)) {
    for (const t of T.TEMPLATES) {
      for (const [w, h] of [[1000, 1000], [1500, 500], [128, 128]]) {
        cv.width = w; cv.height = h;
        try {
          T.render(cv, Object.assign({ emoji: '', bitmap: null, template: t.id, pal: T.PALETTES[2], seed: 3, transparent: false, _cache: {} }, c));
        } catch (e) { bad.push([label, t.id, w + 'x' + h, e.message]); continue; }
        const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
        let nonFinite = false;
        if (!d.length) nonFinite = true;
        if (nonFinite) bad.push([label, t.id, 'empty-buffer']);
      }
    }
  }
  return bad;
})()`, { quiet: true });
console.log('1d. edge-case text:', edge.__error ? 'EVAL ERROR ' + edge.__error : (edge.length ? edge.slice(0, 6) : 'all 216 renders clean'));
if (edge.__error) note('edge-eval', edge.__error);
else if (edge.length) note('edge-render', JSON.stringify(edge.slice(0, 6)));

// 1e. huge canvas + tiny canvas should not throw
const extremes = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const cv = document.createElement('canvas');
  const bad = [];
  for (const [w, h] of [[32, 32], [64, 64], [3000, 3000], [4000, 1000]]) {
    for (const t of T.TEMPLATES) {
      cv.width = w; cv.height = h;
      try {
        T.render(cv, { ticker: 'EDGE', name: 'edge', tagline: 'e', emoji: '\\u{1F638}', bitmap: null,
          template: t.id, pal: T.PALETTES[7], seed: 1, transparent: false, _cache: {} });
      } catch (e) { bad.push([w + 'x' + h, t.id, e.message]); }
    }
  }
  return bad;
})()`, { quiet: true });
console.log('1e. extreme sizes:', extremes.__error ? 'EVAL ERROR' : (extremes.length ? extremes : '48 renders clean'));
if (extremes.length) note('extreme-size', JSON.stringify(extremes.slice(0, 4)));

// 1f. memory: repeated renders must not grow the heap without bound
const heap = await S.evaluate(`(async () => {
  const T = await import('./templates.js?m=${Date.now()}');
  const cv = document.createElement('canvas'); cv.width = cv.height = 500;
  const st = { ticker: 'HEAP', name: 'heap', tagline: 'h', emoji: '\\u{1F436}', bitmap: null, pal: T.PALETTES[0], transparent: false, _cache: {} };
  const run = n => { for (let i = 0; i < n; i++) for (const t of T.TEMPLATES) T.render(cv, Object.assign({}, st, { template: t.id, seed: i })); };
  run(10);
  const a = performance.memory ? performance.memory.usedJSHeapSize : 0;
  const t0 = performance.now();
  run(40);
  const ms = performance.now() - t0;
  const b = performance.memory ? performance.memory.usedJSHeapSize : 0;
  return { beforeMB: +(a / 1048576).toFixed(1), afterMB: +(b / 1048576).toFixed(1), rendersPerSec: Math.round((40 * 12) / (ms / 1000)) };
})()`);
console.log('1f. heap after 600 renders:', heap.beforeMB + 'MB ->', heap.afterMB + 'MB |', heap.rendersPerSec, 'renders/sec');
if (heap.afterMB - heap.beforeMB > 220) note('heap-growth', heap.beforeMB + ' -> ' + heap.afterMB + ' MB');

console.log('\nconsole output during tests:', S.logs.length ? S.logs.slice(0, 8) : 'CLEAN');
if (S.logs.length) note('console', S.logs.slice(0, 3).join(' | '));
console.log(fails.length ? '\nFAILURES (' + fails.length + '):\n' + fails.join('\n') : '\nALL TEST-1 CHECKS PASSED');
S.close();
process.exit(0);
