// Test 3: every UI control, keyboard shortcut, image path, and the research panel.
import { launch, sleep } from './cdp.mjs';
import fs from 'node:fs';
import path from 'node:path';
const SCRATCH = import.meta.dirname;
const DL = path.join(SCRATCH, 'downloads');
fs.rmSync(DL, { recursive: true, force: true });
fs.mkdirSync(DL, { recursive: true });

const S = await launch({ port: 9343, profile: 'cdp-ui', url: 'http://localhost:4477/generator.html', scratch: SCRATCH });
await sleep(2600);
await S.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

const fails = [];
const ok = (cond, label, detail = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails.push(label + ' ' + detail);
};

// keep Explorer from popping open on every save during the test
await S.evaluate(`(() => {
  window.__reveals = 0;
  const f = window.fetch;
  window.fetch = (u, o) => {
    if (String(u).startsWith('/api/reveal')) { window.__reveals++; return Promise.resolve(new Response('{}')); }
    return f(u, o);
  };
  window.__hash = () => document.querySelector('#big').toDataURL().length + ':' +
    document.querySelector('#big').toDataURL().slice(-40);
  return true;
})()`);

const hash = () => S.evaluate(`window.__hash()`);
const key = (k, code) => S.evaluate(`(() => { document.dispatchEvent(new KeyboardEvent('keydown',
  { key: ${JSON.stringify(k)}, code: ${JSON.stringify(code || k)}, bubbles: true })); return true; })()`);

console.log('palette chips');
{
  const r = await S.evaluate(`(async () => {
    const chips = [...document.querySelectorAll('#palettes .chip')];
    chips[chips.length - 1].click(); // start somewhere other than chip 0
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const seen = new Set(); const noChange = []; const noSelect = [];
    for (const c of chips) {
      const before = window.__hash();
      c.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = window.__hash();
      if (before === after) noChange.push(c.textContent);
      const on = document.querySelectorAll('#palettes .chip.on');
      if (on.length !== 1 || on[0].dataset.pal !== c.dataset.pal) noSelect.push(c.textContent);
      seen.add(after);
    }
    return { count: chips.length, noChange, noSelect, distinct: seen.size };
  })()`);
  ok(r.count === 12, 'all 12 palettes present', String(r.count));
  ok(r.noChange.length === 0, 'every palette changes the render', r.noChange.join(','));
  ok(r.noSelect.length === 0, 'clicked palette marks itself selected', r.noSelect.join(','));
  ok(r.distinct === 12, 'all 12 palettes produce distinct output', String(r.distinct));
}

console.log('style tiles');
{
  const r = await S.evaluate(`(async () => {
    const tiles = [...document.querySelectorAll('.tile')];
    const noSel = [], noChange = []; const seen = new Set();
    for (const t of tiles) {
      const before = window.__hash();
      t.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!t.classList.contains('on')) noSel.push(t.dataset.id);
      if (document.querySelectorAll('.tile.on').length !== 1) noSel.push('multi:' + t.dataset.id);
      const after = window.__hash();
      if (before === after) noChange.push(t.dataset.id);
      seen.add(after);
    }
    return { count: tiles.length, noSel, noChange, distinct: seen.size };
  })()`);
  ok(r.count === 12, '12 style tiles', String(r.count));
  ok(r.noSel.length === 0, 'exactly one tile selected at a time', r.noSel.join(','));
  ok(r.distinct === 12, 'all 12 styles render differently', String(r.distinct));
}

console.log('size selector');
{
  const r = await S.evaluate(`(async () => {
    const sel = document.querySelector('#sizeSel');
    const out = [];
    for (const o of [...sel.options]) {
      sel.value = o.value; sel.dispatchEvent(new Event('change'));
      await new Promise(r => requestAnimationFrame(r));
      const b = document.querySelector('#big');
      out.push([o.value, b.width + 'x' + b.height, b.classList.contains('alpha'), document.querySelector('#bigMeta').textContent.trim()]);
    }
    sel.value = 'logo-1000.png'; sel.dispatchEvent(new Event('change'));
    return out;
  })()`);
  const want = { 'logo-1000.png': '1000x1000', 'pfp-512.png': '512x512', 'pfp-400.png': '400x400',
    'icon-128.png': '128x128', 'og-1200x630.png': '1200x630', 'banner-1500x500.png': '1500x500',
    'logo-1000-alpha.png': '1000x1000' };
  const bad = r.filter(([v, dim]) => want[v] !== dim);
  ok(bad.length === 0, 'every size option sets the right canvas dimensions', JSON.stringify(bad));
  ok(r.find(x => x[0] === 'logo-1000-alpha.png')[2] === true, 'transparent option shows the checkerboard');
  ok(r.every(x => x[3].length > 5), 'meta line updates for each size');
}

console.log('emoji row + field');
{
  const r = await S.evaluate(`(async () => {
    const btns = [...document.querySelectorAll('.em')];
    const noChange = []; const seen = new Set();
    for (const b of btns) {
      const before = window.__hash();
      b.click();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = window.__hash();
      if (before === after) noChange.push(b.textContent);
      if (document.querySelector('#emoji').value !== b.textContent) noChange.push('field:' + b.textContent);
      seen.add(after);
    }
    // typing an emoji directly
    const e = document.querySelector('#emoji');
    e.value = '\\u{1F984}'; e.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const typed = window.__hash();
    // clearing it falls back to text-only art
    e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { count: btns.length, noChange, distinct: seen.size, typedWorked: typed !== window.__hash() };
  })()`);
  ok(r.count === 16, '16 emoji shortcuts', String(r.count));
  ok(r.noChange.length === 0, 'every emoji button changes art and field', r.noChange.join(','));
  ok(r.distinct === 16, 'each emoji renders distinctly', String(r.distinct));
  ok(r.typedWorked, 'typing an emoji directly works');
}

console.log('image load, cutout, clear');
{
  const r = await S.evaluate(`(async () => {
    // a flat-magenta background with a dark blob: exactly the cutout case
    const c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d');
    x.fillStyle = '#ff00ff'; x.fillRect(0, 0, 240, 240);
    x.fillStyle = '#20304a'; x.beginPath(); x.arc(120, 120, 72, 0, 7); x.fill();
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'subject.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    const before = window.__hash();
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 700));
    const afterDrop = window.__hash();

    // how much of the subject survived the cutout?
    const probe = (() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const g = cv.getContext('2d', { willReadFrequently: true });
      return () => {
        g.clearRect(0, 0, 256, 256);
        return null;
      };
    })();

    const hint = document.querySelector('#dropHint').textContent;
    const clearShown = !document.querySelector('#clearImg').hidden;

    // cutout off -> magenta must come back
    const cut = document.querySelector('#cut');
    cut.checked = false; cut.dispatchEvent(new Event('change'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cutOff = window.__hash();
    // sample the big canvas for magenta
    const big = document.querySelector('#big');
    const copy = document.createElement('canvas');
    const sample = () => {
      copy.width = big.width; copy.height = big.height;
      const cc = copy.getContext('2d', { willReadFrequently: true });
      cc.drawImage(big, 0, 0);
      const d = cc.getImageData(0, 0, big.width, big.height).data;
      let magenta = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 23) {
        if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) magenta++;
        n++;
      }
      return magenta / n;
    };
    const magentaWithoutCutout = sample();
    cut.checked = true; cut.dispatchEvent(new Event('change'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const magentaWithCutout = sample();

    document.querySelector('#clearImg').click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const afterClear = window.__hash();
    return { changedOnDrop: before !== afterDrop, hint, clearShown,
      magentaWithoutCutout: +magentaWithoutCutout.toFixed(3), magentaWithCutout: +magentaWithCutout.toFixed(3),
      clearedBack: afterClear === before, cutToggleChanged: cutOff !== afterDrop,
      clearBtnHiddenAgain: document.querySelector('#clearImg').hidden };
  })()`);
  ok(r.changedOnDrop, 'dropping an image changes the art');
  ok(r.hint.includes('subject'), 'filename shown in the drop zone', r.hint);
  ok(r.clearShown, 'clear button appears once an image is loaded');
  ok(r.magentaWithoutCutout > 0.05, 'with cutout off the flat background is kept', String(r.magentaWithoutCutout));
  ok(r.magentaWithCutout < 0.01, 'with cutout on the flat background is removed', String(r.magentaWithCutout));
  ok(r.cutToggleChanged, 'toggling cutout re-renders');
  ok(r.clearedBack, 'clearing returns to the pre-image render');
  ok(r.clearBtnHiddenAgain, 'clear button hides again');
}

console.log('paste path');
{
  const r = await S.evaluate(`(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 120;
    const x = c.getContext('2d'); x.fillStyle = '#0a5'; x.fillRect(0, 0, 120, 120);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'pasted.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    const before = window.__hash();
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    await new Promise(r => setTimeout(r, 700));
    const after = window.__hash();
    const hint = document.querySelector('#dropHint').textContent;
    document.querySelector('#clearImg').click();
    await new Promise(r => requestAnimationFrame(r));
    return { changed: before !== after, hint };
  })()`);
  ok(r.changed, 'pasting an image loads it');
  ok(r.hint.includes('pasted'), 'pasted filename shown', r.hint);
}

console.log('keyboard');
{
  await S.evaluate(`(() => { document.activeElement.blur(); return true; })()`);
  const b1 = await hash(); await key(' ', 'Space'); await sleep(120);
  ok(b1 !== await hash(), 'space rerolls the seed');

  const b2 = await hash(); await key('p'); await sleep(120);
  ok(b2 !== await hash(), 'p cycles palette');

  const sel = [];
  for (const k of ['1', '5', '9', '0']) { await key(k); await sleep(90); sel.push(await S.evaluate(`document.querySelector('.tile.on').dataset.id`)); }
  ok(new Set(sel).size === 4, 'number keys select different styles', sel.join(','));

  await key('/'); await sleep(120);
  ok(await S.evaluate(`document.activeElement.id`) === 'ticker', 'slash focuses the ticker field');

  // typing letters in a field must not fire shortcuts
  const beforeType = await S.evaluate(`document.querySelector('.tile.on').dataset.id`);
  const reveals0 = await S.evaluate(`window.__reveals`);
  await S.evaluate(`(() => {
    const el = document.querySelector('#name'); el.focus();
    for (const k of ['s', 'd', 'p', 'r', '1']) el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    return true; })()`);
  await sleep(300);
  ok(await S.evaluate(`document.querySelector('.tile.on').dataset.id`) === beforeType, 'typing in a field does not switch styles');
  ok(await S.evaluate(`window.__reveals`) === reveals0, 'typing "s" in a field does not save');
  ok(await S.evaluate(`document.querySelector('#research').hidden`) === true, 'typing "r" in a field does not open research');

  await key('Escape'); await sleep(100);
  ok(await S.evaluate(`document.activeElement.tagName`) === 'BODY', 'escape leaves the field');
}

console.log('download');
{
  await S.evaluate(`(() => { document.activeElement.blur(); return true; })()`);
  await key('d');
  await sleep(1500);
  const files = fs.readdirSync(DL).filter(f => !f.endsWith('.crdownload'));
  ok(files.length >= 1, 'pressing d downloads a PNG', files.join(','));
  if (files.length) {
    const p = path.join(DL, files[0]);
    const buf = fs.readFileSync(p);
    ok(buf.slice(1, 4).toString() === 'PNG', 'downloaded file is a real PNG', files[0]);
    ok(buf.length > 5000, 'downloaded PNG has content', buf.length + ' bytes');
  }
}

console.log('save pack from the UI');
{
  const before = fs.readdirSync(path.join(SCRATCH, '..', 'out'));
  await S.evaluate(`(() => { document.querySelector('#ticker').value = 'UITEST';
    document.querySelector('#ticker').dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await sleep(300);
  await S.evaluate(`document.querySelector('#save').click()`);
  await sleep(4500);
  const after = fs.readdirSync(path.join(SCRATCH, '..', 'out')).filter(d => !before.includes(d));
  ok(after.length === 1, 'save creates exactly one pack folder', after.join(','));
  if (after.length) {
    const dir = path.join(path.join(SCRATCH, '..', 'out'), after[0]);
    const files = fs.readdirSync(dir);
    const want = ['logo-1000.png', 'pfp-512.png', 'pfp-400.png', 'icon-128.png', 'og-1200x630.png',
      'banner-1500x500.png', 'logo-1000-alpha.png', 'meta.json'];
    ok(want.every(f => files.includes(f)), 'pack contains all 8 files', files.length + ' files');
    ok(after[0].startsWith('uitest-'), 'folder named from the ticker', after[0]);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
    ok(meta.ticker === 'UITEST' && meta.template && meta.palette && typeof meta.seed === 'number',
      'meta.json records ticker/style/palette/seed', JSON.stringify(meta).slice(0, 90));
    const sizes = want.filter(f => f.endsWith('.png')).map(f => fs.statSync(path.join(dir, f)).size);
    ok(sizes.every(s => s > 400), 'every PNG has real content', sizes.join('/'));
    ok(await S.evaluate(`window.__reveals`) >= 1, 'save asks to reveal the folder');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('research panel');
{
  await S.evaluate(`document.querySelector('#researchToggle').click()`);
  await sleep(7000);
  const r = await S.evaluate(`({
    open: !document.querySelector('#research').hidden,
    rows: document.querySelectorAll('#feed .row').length,
    words: document.querySelectorAll('#words .word').length,
    ideas: document.querySelectorAll('#ideas .idea').length,
    chains: document.querySelector('#rchain').options.length,
    status: document.querySelector('#rstatus').textContent,
  })`);
  ok(r.open, 'research panel opens');
  ok(r.rows > 10, 'feed has rows', String(r.rows));
  ok(r.words > 10, 'meta words rendered', String(r.words));
  ok(r.ideas === 12, 'name lab shows 12 candidates', String(r.ideas));
  ok(r.chains > 1, 'chain filter populated', String(r.chains));

  const filt = await S.evaluate(`(async () => {
    const q = document.querySelector('#rq');
    const all = document.querySelectorAll('#feed .row').length;
    q.value = 'zzzzzznotathing'; q.dispatchEvent(new Event('input'));
    const none = document.querySelectorAll('#feed .row').length;
    const emptyMsg = document.querySelector('#feed').textContent.includes('nothing matches');
    q.value = ''; q.dispatchEvent(new Event('input'));
    const back = document.querySelectorAll('#feed .row').length;
    const sel = document.querySelector('#rchain');
    sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change'));
    const chainRows = document.querySelectorAll('#feed .row').length;
    const chainName = sel.value;
    sel.value = 'all'; sel.dispatchEvent(new Event('change'));
    return { all, none, emptyMsg, back, chainRows, chainName, restored: document.querySelectorAll('#feed .row').length };
  })()`);
  ok(filt.none === 0 && filt.emptyMsg, 'filter with no matches shows an empty state');
  ok(filt.back === filt.all, 'clearing the filter restores the feed', filt.back + '/' + filt.all);
  ok(filt.chainRows > 0 && filt.chainRows <= filt.all, 'chain filter narrows the feed', filt.chainName + ': ' + filt.chainRows);
  ok(filt.restored === filt.all, 'chain filter resets');

  const lab = await S.evaluate(`(async () => {
    const first = [...document.querySelectorAll('#ideas .idea')].map(e => e.textContent.trim()).join('|');
    document.querySelector('#reroll').click();
    await new Promise(r => setTimeout(r, 300));
    const second = [...document.querySelectorAll('#ideas .idea')].map(e => e.textContent.trim()).join('|');
    document.querySelector('#words .word').click();
    await new Promise(r => setTimeout(r, 300));
    const third = [...document.querySelectorAll('#ideas .idea')].map(e => e.textContent.trim()).join('|');
    const word = document.querySelector('#words .word').dataset.w;
    const usesWord = [...document.querySelectorAll('#ideas .idea')].some(e => e.textContent.toLowerCase().includes(word.slice(0, 4)));
    return { rerolled: first !== second, wordChanged: second !== third, usesWord, word };
  })()`);
  ok(lab.rerolled, 'reroll produces new name candidates');
  ok(lab.wordChanged, 'clicking a meta word regenerates candidates');
  ok(lab.usesWord, 'generated names use the clicked word', lab.word);

  await sleep(2500);
  const avail = await S.evaluate(`[...document.querySelectorAll('#ideas .st')].map(e => e.textContent)`);
  ok(avail.every(t => t !== '...'), 'every candidate resolves an availability check', avail.slice(0, 4).join(','));
  ok(avail.some(t => t === 'free' || /taken/.test(t)), 'availability shows free/taken', avail.slice(0, 3).join(','));

  const steal = await S.evaluate(`(async () => {
    const before = document.querySelector('#ticker').value;
    document.querySelector('#feed [data-steal]').click();
    await new Promise(r => setTimeout(r, 400));
    return { before, after: document.querySelector('#ticker').value, name: document.querySelector('#name').value };
  })()`);
  ok(steal.after !== steal.before && steal.after.length > 0, 'stealing a name from the feed fills the studio',
    steal.before + ' -> ' + steal.after);

  const idea = await S.evaluate(`(async () => {
    document.querySelector('#ideas [data-use]').click();
    await new Promise(r => setTimeout(r, 400));
    return { t: document.querySelector('#ticker').value, n: document.querySelector('#name').value };
  })()`);
  ok(idea.t.length > 0 && idea.n.length > 0, 'using a candidate fills ticker and name', idea.t + ' / ' + idea.n);
}

console.log('hostile feed content is escaped, not executed');
{
  const r = await S.evaluate(`(async () => {
    window.__xss = 0;
    const real = window.fetch;
    window.fetch = (u, o) => {
      if (String(u).startsWith('/api/trends')) {
        return Promise.resolve(new Response(JSON.stringify({
          at: Date.now(),
          rows: [{
            key: 'x:1', chain: 'solana', address: '0xDEAD', url: 'javascript:window.__xss=1',
            icon: 'x" onerror="window.__xss=1', description: '<img src=x onerror="window.__xss=1">pwn',
            name: '<script>window.__xss=1<\\/script>EVIL', symbol: '"><b>BAD</b>',
            boost: 1, links: [], sources: ['fresh'], heat: 99, fdv: 1, liq: 1, vol24: 1, chg: {}, age: 1,
          }],
          words: [{ word: '<b>wordy</b>', n: 3 }], broad: [{ symbol: '<i>x</i>', thumb: 'x" onerror="window.__xss=1', chg: 1 }],
        }), { headers: { 'content-type': 'application/json' } }));
      }
      if (String(u).startsWith('/api/reveal')) return Promise.resolve(new Response('{}'));
      return real(u, o);
    };
    document.querySelector('#rrefresh').click();
    await new Promise(r => setTimeout(r, 1200));
    const feed = document.querySelector('#feed');
    return {
      xss: window.__xss,
      scriptTags: document.querySelectorAll('#research script, #research [onerror], #research [onload], #research iframe').length,
      literal: feed.textContent.includes('<script>') || feed.textContent.includes('<b>BAD</b>'),
      hrefs: [...feed.querySelectorAll('a')].map(a => a.getAttribute('href')),
    };
  })()`);
  ok(r.xss === 0, 'no injected script ran', 'flag=' + r.xss);
  ok(r.scriptTags === 0, 'hostile markup is not parsed into elements', String(r.scriptTags));
  ok(r.literal, 'hostile strings render as literal text');
  ok(!r.hrefs.some(h => /^javascript:/i.test(h)), 'no javascript: links in the feed', JSON.stringify(r.hrefs));
}

console.log('\nconsole output:', S.logs.length ? S.logs.slice(0, 6) : 'CLEAN');
if (S.logs.filter(l => !/favicon/i.test(l)).length) fails.push('console: ' + S.logs[0]);
console.log(fails.length ? '\nFAILURES (' + fails.length + '):\n' + fails.join('\n') : '\nALL TEST-3 CHECKS PASSED');
S.close();
process.exit(0);
