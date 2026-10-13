// Live launch research: what is being promoted right now, what words the current
// meta is built from, and whether a ticker you want is already taken.

const $ = s => document.querySelector(s);
let onIdea = () => {};
let DATA = null;

export async function checkTicker(q) {
  const r = await fetch('/api/ticker?q=' + encodeURIComponent(q));
  if (!r.ok) throw new Error('check failed');
  return r.json();
}

const fmtUsd = n => {
  if (!n) return '-';
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
};
const fmtAge = ms => {
  if (!ms) return '-';
  const h = ms / 3.6e6;
  if (h < 1) return Math.round(h * 60) + 'm';
  if (h < 48) return h.toFixed(h < 10 ? 1 : 0) + 'h';
  return Math.round(h / 24) + 'd';
};
const pct = v => (v == null ? '' : (v > 0 ? '+' : '') + v.toFixed(v > -10 && v < 10 ? 1 : 0) + '%');
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Feed values are third-party strings: never let one become a javascript: URL
// or a non-https image source.
const safeUrl = u => (/^https:\/\//i.test(String(u || '')) ? esc(u) : '');

// ---- name lab ---------------------------------------------------------------
const PRE = ['BABY', 'MINI', 'GIGA', 'TURBO', 'BASED', 'ANON', 'MOON', 'DARK', 'HYPER', 'UNCLE', 'FAT', 'TINY', 'HOLY', 'CYBER', 'RETIRED', 'FEDERAL'];
const SUF = ['INU', 'COIN', 'CAT', 'DOG', 'PEPE', 'WIF', 'WOJAK', 'CHAD', 'BOT', 'CORP', 'DAO', 'MAXI', 'GUY', 'LORD', 'SZN', 'TOWN'];
const QUIP = ['first of its kind', 'no roadmap just vibes', 'he just likes the chart', 'fully onchain nonsense',
  'the asset you deserve', 'liquidity locked, brain unlocked', 'we are so back', 'it is not a phase'];

const tickerize = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'MEME';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function ideasFrom(words, rnd = Math.random) {
  const pool = words.length ? words : ['dog', 'cat', 'jeet', 'candle'];
  const pick = a => a[Math.floor(rnd() * a.length)];
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < 12 && guard++ < 200) {
    const w = pick(pool);
    const mode = Math.floor(rnd() * 5);
    let name, ticker;
    if (mode === 0) { const p = pick(PRE); name = `${cap(p.toLowerCase())} ${cap(w)}`; ticker = tickerize(p.slice(0, 1) + w); }
    else if (mode === 1) { const s = pick(SUF); name = `${cap(w)} ${cap(s.toLowerCase())}`; ticker = tickerize(w + s.slice(0, 3)); }
    else if (mode === 2) { const s = pick(SUF); name = cap(w) + s.toLowerCase(); ticker = tickerize(w + s); }
    else if (mode === 3) { const w2 = pick(pool); if (w2 === w) continue; name = `${cap(w)} ${cap(w2)}`; ticker = tickerize(w.slice(0, 3) + w2.slice(0, 3)); }
    else { name = cap(w) + ' ' + (1 + Math.floor(rnd() * 8)) + '.0'; ticker = tickerize(w); }
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    out.push({ ticker, name, tagline: pick(QUIP) });
  }
  return out;
}

async function renderIdeas(words) {
  const box = $('#ideas');
  const ideas = ideasFrom(words);
  box.innerHTML = ideas.map((i, n) => `
    <div class="idea" data-n="${n}">
      <div class="idea-main"><b>$${esc(i.ticker)}</b><span>${esc(i.name)}</span></div>
      <div class="idea-right"><span class="st" data-st="${n}">...</span>
      <button class="mini" data-use="${n}">use</button></div>
    </div>`).join('');
  box.querySelectorAll('[data-use]').forEach(b => {
    b.onclick = () => onIdea(ideas[Number(b.dataset.use)]);
  });
  // availability in parallel; server caches so re-rolls are cheap
  ideas.forEach(async (i, n) => {
    const el = box.querySelector(`[data-st="${n}"]`);
    try {
      const r = await checkTicker(i.ticker);
      el.textContent = r.taken ? r.taken + ' taken' : 'free';
      el.className = 'st ' + (r.taken ? 'bad' : 'ok');
    } catch { el.textContent = '?'; }
  });
}

// ---- feed -------------------------------------------------------------------
function rowHtml(r) {
  const sym = r.symbol ? '$' + r.symbol : r.address.slice(0, 5) + '..';
  const c24 = r.chg && r.chg.h24;
  const src = [...new Set(r.sources)].map(s => `<i class="src ${s}">${s === 'boost-top' ? 'paid' : s === 'boost-new' ? 'new boost' : 'fresh'}</i>`).join('');
  return `<div class="row">
    <div class="heat" style="--h:${Math.min(100, r.heat)}%"><span>${r.heat}</span></div>
    ${safeUrl(r.icon) ? `<img class="ico" src="${safeUrl(r.icon)}" loading="lazy" alt="">` : '<div class="ico ph"></div>'}
    <div class="who">
      <div class="l1"><b>${esc(sym)}</b> <span class="nm">${esc((r.name || '').slice(0, 34))}</span> <i class="ch">${esc(r.chain)}</i> ${src}</div>
      <div class="l2">${esc((r.description || '').slice(0, 118))}</div>
    </div>
    <div class="nums">
      <span>${fmtUsd(r.fdv)} <i>fdv</i></span>
      <span>${fmtUsd(r.vol24)} <i>24h vol</i></span>
      <span class="${c24 > 0 ? 'up' : c24 < 0 ? 'dn' : ''}">${pct(c24)} <i>24h</i></span>
      <span>${fmtAge(r.age)} <i>age</i></span>
    </div>
    <div class="acts">
      <button class="mini" data-steal="${esc(r.key)}">name</button>
      ${safeUrl(r.url) ? `<a class="mini" href="${safeUrl(r.url)}" target="_blank" rel="noreferrer">dex</a>` : ''}
    </div>
  </div>`;
}

function renderFeed() {
  const q = $('#rq').value.trim().toLowerCase();
  const chain = $('#rchain').value;
  let rows = DATA.rows;
  if (chain !== 'all') rows = rows.filter(r => r.chain === chain);
  if (q) rows = rows.filter(r => ((r.symbol || '') + ' ' + (r.name || '') + ' ' + r.description).toLowerCase().includes(q));
  $('#feed').innerHTML = rows.slice(0, 60).map(rowHtml).join('') || '<p class="muted">nothing matches</p>';
  $('#feed').querySelectorAll('[data-steal]').forEach(b => {
    b.onclick = () => {
      const r = DATA.rows.find(x => x.key === b.dataset.steal);
      onIdea({ ticker: r.symbol || 'MEME', name: r.name || '', tagline: (r.description || '').split(/[.!?\n]/)[0].slice(0, 44) });
    };
  });
  $('#rcount').textContent = rows.length + ' live';
}

function renderWords() {
  const el = $('#words');
  el.innerHTML = DATA.words.slice(0, 30).map(w =>
    `<button class="word" data-w="${esc(w.word)}" style="--n:${Math.min(1, w.n / 8)}">${esc(w.word)}<i>${w.n}</i></button>`).join('');
  el.querySelectorAll('[data-w]').forEach(b => {
    b.onclick = () => renderIdeas([b.dataset.w, b.dataset.w, ...DATA.words.slice(0, 14).map(w => w.word)]);
  });
  $('#broad').innerHTML = (DATA.broad || []).slice(0, 12).map(c =>
    `<span class="bc">${safeUrl(c.thumb) ? `<img src="${safeUrl(c.thumb)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<i class="${c.chg > 0 ? 'up' : 'dn'}">${pct(c.chg)}</i></span>`).join('');
}

async function load(force) {
  const st = $('#rstatus');
  st.textContent = 'loading...';
  try {
    DATA = await fetch('/api/trends' + (force ? '?t=' + Date.now() : '')).then(r => r.json());
    const chains = [...new Set(DATA.rows.map(r => r.chain))].sort();
    $('#rchain').innerHTML = '<option value="all">all chains</option>' +
      chains.map(c => `<option>${esc(c)}</option>`).join('');
    renderWords();
    renderFeed();
    renderIdeas(DATA.words.slice(0, 18).map(w => w.word));
    st.textContent = 'updated ' + new Date(DATA.at).toLocaleTimeString();
  } catch (e) {
    st.textContent = 'offline - feed unavailable';
  }
}

export function mountResearch(ideaHandler) {
  onIdea = ideaHandler || onIdea;
  const panel = $('#research');
  $('#researchToggle').onclick = () => {
    const open = panel.hidden;
    panel.hidden = !open;
    $('#researchToggle').classList.toggle('on', open);
    if (open && !DATA) load();
  };
  $('#rrefresh').onclick = () => load(true);
  $('#rq').oninput = () => DATA && renderFeed();
  $('#rchain').onchange = () => DATA && renderFeed();
  $('#reroll').onclick = () => renderIdeas((DATA ? DATA.words.slice(0, 18).map(w => w.word) : []));
}
