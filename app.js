import { TEMPLATES, PALETTES, render } from './templates.js';
import { hashStr } from './gfx.js';
import { mountResearch, checkTicker } from './research.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

export const SIZES = [
  { name: 'logo-1000.png', w: 1000, h: 1000, label: 'Logo 1000' },
  { name: 'pfp-512.png', w: 512, h: 512, label: 'PFP 512' },
  { name: 'pfp-400.png', w: 400, h: 400, label: 'PFP 400' },
  { name: 'icon-128.png', w: 128, h: 128, label: 'Icon 128' },
  { name: 'og-1200x630.png', w: 1200, h: 630, label: 'OG card' },
  { name: 'banner-1500x500.png', w: 1500, h: 500, label: 'X banner' },
  { name: 'logo-1000-alpha.png', w: 1000, h: 1000, transparent: true, label: 'Transparent' },
];

const S = {
  ticker: 'WIFHAT', name: 'dog with hat', tagline: 'he has a hat',
  emoji: '', bitmap: null, rawBitmap: null,
  template: 'coin', pal: PALETTES[0], seed: 1, transparent: false,
  cutout: true, _cache: {},
};

const bust = () => { S._cache = {}; };

// ---- background removal -----------------------------------------------------
// Flood fill from the border inwards, knocking out pixels close to the border
// colour. Handles the usual "flat background PNG/JPEG off Twitter" case.
function cutout(bitmap, tol = 42) {
  const N = Math.min(1024, Math.max(bitmap.width, bitmap.height));
  const k = Math.min(N / bitmap.width, N / bitmap.height);
  const w = Math.max(1, Math.round(bitmap.width * k)), h = Math.max(1, Math.round(bitmap.height * k));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const at = (x, y) => (y * w + x) * 4;
  // seed colour = median-ish of the four corners
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => {
    const i = at(x, y); return [d[i], d[i + 1], d[i + 2]];
  });
  const seedC = corners[0].map((_, j) => corners.reduce((s, c) => s + c[j], 0) / 4);
  const spread = Math.max(...corners.map(c => Math.hypot(c[0] - seedC[0], c[1] - seedC[1], c[2] - seedC[2])));
  if (spread > 70) return null; // busy background: leave it alone
  const near = i => Math.hypot(d[i] - seedC[0], d[i + 1] - seedC[1], d[i + 2] - seedC[2]) < tol;

  const stack = [];
  const visited = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) { stack.push(x, 0, x, h - 1); }
  for (let y = 0; y < h; y++) { stack.push(0, y, w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const p = y * w + x;
    if (visited[p]) continue;
    const i = p * 4;
    if (!near(i)) continue;
    visited[p] = 1;
    d[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  ctx.putImageData(img, 0, 0);
  // feather: blur the cut edge slightly so it does not look scissored
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.filter = 'blur(0.6px)';
  o.drawImage(cv, 0, 0);
  o.filter = 'none';
  o.drawImage(cv, 0, 0);
  return out;
}

async function setImage(file) {
  const bmp = await createImageBitmap(file);
  S.rawBitmap = bmp;
  applyCutout();
  $('#dropHint').textContent = file.name.slice(0, 28);
  $('#clearImg').hidden = false;
  renderAll();
}

function applyCutout() {
  if (!S.rawBitmap) { S.bitmap = null; return; }
  if (!S.cutout) { S.bitmap = S.rawBitmap; bust(); return; }
  const c = cutout(S.rawBitmap);
  S.bitmap = c || S.rawBitmap;
  $('#cutNote').textContent = c ? '' : 'busy bg - kept as is';
  bust();
}

// ---- rendering --------------------------------------------------------------
const tiles = new Map();

function buildGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  TEMPLATES.forEach((t, i) => {
    const el = document.createElement('button');
    el.className = 'tile';
    el.dataset.id = t.id;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 300;
    el.append(cv);
    const cap = document.createElement('span');
    cap.className = 'cap';
    cap.innerHTML = `<b>${i + 1 <= 9 ? i + 1 : i === 9 ? 0 : ''}</b> ${t.label}`;
    el.append(cap);
    el.onclick = () => select(t.id);
    grid.append(el);
    tiles.set(t.id, cv);
  });
}

function buildPalettes() {
  const row = $('#palettes');
  row.innerHTML = '';
  PALETTES.forEach(p => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.pal = p.id;
    b.style.setProperty('--a', p.accent);
    b.style.setProperty('--b', p.bg[1][1]);
    b.title = p.name;
    b.textContent = p.name;
    b.onclick = () => setPalette(p);
    row.append(b);
  });
  syncPalettes();
}

// Mark the active chip in place: rebuilding the row would drop keyboard focus.
function syncPalettes() {
  $$('#palettes .chip').forEach(c => c.classList.toggle('on', c.dataset.pal === S.pal.id));
}

function setPalette(p) {
  S.pal = p;
  syncPalettes();
  renderAll();
}

let raf = 0;
function renderAll() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    for (const t of TEMPLATES) render(tiles.get(t.id), { ...S, template: t.id });
    renderBig();
    $$('.tile').forEach(el => el.classList.toggle('on', el.dataset.id === S.template));
    const slug = (S.ticker || 'coin').toLowerCase();
    $('#packName').textContent = slug + '-*';
  });
}

function renderBig() {
  const big = $('#big');
  const size = SIZES.find(s => s.name === $('#sizeSel').value) || SIZES[0];
  big.width = size.w; big.height = size.h;
  big.classList.toggle('alpha', !!(size.transparent || S.transparent));
  render(big, { ...S, transparent: size.transparent || S.transparent });
  $('#bigMeta').textContent = `${size.w}x${size.h}  ${TEMPLATES.find(t => t.id === S.template).label}  ${S.pal.name}`;
}

function select(id) { S.template = id; renderAll(); }

function reroll() { S.seed = Math.floor(Math.random() * 1e9); renderAll(); }

// ---- saving -----------------------------------------------------------------
async function savePack() {
  const btn = $('#save');
  btn.disabled = true; btn.textContent = 'writing...';
  const cv = document.createElement('canvas');
  const files = [];
  for (const sz of SIZES) {
    cv.width = sz.w; cv.height = sz.h;
    render(cv, { ...S, transparent: sz.transparent || S.transparent });
    files.push({ name: sz.name, data: cv.toDataURL('image/png') });
  }
  try {
    const r = await fetch('/api/save', {
      method: 'POST',
      body: JSON.stringify({
        slug: S.ticker || 'coin', files,
        meta: {
          ticker: S.ticker, name: S.name, tagline: S.tagline, emoji: S.emoji,
          template: S.template, palette: S.pal.id, seed: S.seed, at: new Date().toISOString(),
        },
      }),
    }).then(r => r.json());
    btn.textContent = 'saved -> ' + r.dir.split('\\').pop();
    fetch('/api/reveal?dir=' + encodeURIComponent(r.dir)).catch(() => {});
  } catch (e) {
    btn.textContent = 'save failed';
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = 'Save pack  S'; }, 2600);
}

function downloadOne() {
  const big = $('#big');
  const a = document.createElement('a');
  a.download = `${(S.ticker || 'coin').toLowerCase()}-${S.template}-${big.width}.png`;
  a.href = big.toDataURL('image/png');
  a.click();
}

// ---- wiring -----------------------------------------------------------------
function bindInputs() {
  const bindText = (sel, key, up) => {
    const el = $(sel);
    el.value = S[key];
    el.oninput = () => {
      S[key] = up ? el.value.toUpperCase().replace(/^\$/, '') : el.value;
      if (up) el.value = S[key];
      if (key === 'ticker') debouncedCheck();
      renderAll();
    };
  };
  bindText('#ticker', 'ticker', true);
  bindText('#name', 'name');
  bindText('#tagline', 'tagline');

  const em = $('#emoji');
  em.oninput = () => { S.emoji = [...em.value].slice(0, 2).join(''); em.value = S.emoji; bust(); renderAll(); };
  $$('.em').forEach(b => b.onclick = () => { S.emoji = b.textContent; $('#emoji').value = S.emoji; bust(); renderAll(); });

  $('#sizeSel').onchange = renderBig;
  $('#roll').onclick = reroll;
  $('#save').onclick = savePack;
  $('#dl').onclick = downloadOne;
  $('#alpha').onchange = e => { S.transparent = e.target.checked; renderAll(); };
  $('#cut').onchange = e => { S.cutout = e.target.checked; applyCutout(); renderAll(); };
  $('#clearImg').onclick = () => {
    S.bitmap = S.rawBitmap = null; bust();
    $('#dropHint').textContent = 'drop image / paste';
    $('#clearImg').hidden = true;
    renderAll();
  };
  $('#file').onchange = e => e.target.files[0] && setImage(e.target.files[0]);

  // drop + paste anywhere
  addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('dragging'); });
  addEventListener('dragleave', () => document.body.classList.remove('dragging'));
  addEventListener('drop', e => {
    e.preventDefault();
    document.body.classList.remove('dragging');
    const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (f) setImage(f);
  });
  addEventListener('paste', e => {
    const it = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (it) setImage(it.getAsFile());
  });

  addEventListener('keydown', e => {
    const typing = /input|textarea/i.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); $('#ticker').select(); return; }
    if (typing && e.key !== 'Escape') return;
    if (e.key === 'Escape') { document.activeElement.blur(); return; }
    if (e.code === 'Space') { e.preventDefault(); reroll(); return; }
    if (/^[0-9]$/.test(e.key)) {
      const i = e.key === '0' ? 9 : Number(e.key) - 1;
      if (TEMPLATES[i]) select(TEMPLATES[i].id);
      return;
    }
    const k = e.key.toLowerCase();
    if (k === 's') savePack();
    if (k === 'd') downloadOne();
    if (k === 'r') $('#researchToggle').click();
    if (k === 'p') setPalette(PALETTES[(PALETTES.indexOf(S.pal) + 1) % PALETTES.length]);
  });
}

let checkT = 0;
function debouncedCheck() {
  clearTimeout(checkT);
  const q = S.ticker;
  $('#avail').textContent = '';
  if (!q || q.length < 2) return;
  checkT = setTimeout(async () => {
    const el = $('#avail');
    el.textContent = 'checking...';
    el.className = 'avail';
    try {
      const r = await checkTicker(q);
      if (!r.taken) { el.textContent = '$' + q + ' free on dex'; el.className = 'avail ok'; return; }
      const top = r.top[0];
      el.className = 'avail bad';
      el.innerHTML = `${r.taken} live pair${r.taken > 1 ? 's' : ''} use $${q}` +
        (top ? ` - top: ${top.name} ${fmtUsd(top.fdv)} fdv` : '');
    } catch { el.textContent = ''; }
  }, 420);
}

export const fmtUsd = n => {
  if (!n) return '$0';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
};

// Pull a name/ticker suggestion in from the research panel.
export function useIdea({ ticker, name, tagline }) {
  if (ticker) { S.ticker = ticker.toUpperCase().replace(/^\$/, '').slice(0, 14); $('#ticker').value = S.ticker; }
  if (name) { S.name = name.slice(0, 40); $('#name').value = S.name; }
  if (tagline !== undefined) { S.tagline = tagline.slice(0, 48); $('#tagline').value = S.tagline; }
  S.seed = hashStr(S.ticker + S.name) % 1e9;
  debouncedCheck();
  renderAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

buildGrid();
buildPalettes();
bindInputs();
renderAll();
debouncedCheck();
mountResearch(useIdea);
