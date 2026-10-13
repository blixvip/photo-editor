// MemeForge - zero-dependency local server. Serves the studio, proxies market
// research (cached), and writes finished asset packs straight to disk.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = import.meta.dirname;
const OUT = path.join(ROOT, 'out');

// path.resolve().startsWith(dir) would also accept a sibling named 'outside',
// so compare path segments instead of string prefixes.
const inside = (parent, child) => {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const PORT = Number(process.env.PORT || 4477);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
};

// The segmentation model runs on multi-threaded wasm, and SharedArrayBuffer -
// which those threads need - only exists in a cross-origin-isolated page. No
// headers, no threads: inference silently drops to one core and takes ~4x
// longer. Everything here is same-origin, so isolation costs nothing.
// 'credentialless' rather than 'require-corp': both switch cross-origin
// isolation on, but require-corp also demands a CORP header from every
// cross-origin subresource, which blocked the research panel's DexScreener and
// CoinGecko token icons outright. credentialless instead loads them without
// credentials - exactly right for public CDN images.
const ISOLATE = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless',
  'cross-origin-resource-policy': 'same-origin',
};

const cache = new Map();
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

async function getJSON(url) {
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'memeforge/1.0' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}
// Boost feeds return bare CDN keys where profile feeds return full URLs.
const cdn = (v, w, h) => !v ? null
  : (/^https?:/.test(v) ? v
    : 'https://cdn.dexscreener.com/cms/images/' + v + '?width=' + w + '&height=' + h + '&fit=crop&quality=95&format=auto');

const settled = async (p, fallback) => { try { return await p; } catch { return fallback; } };

// ---- research ---------------------------------------------------------------
// Three free keyless feeds. Boosts = someone paid to promote it (hot right now),
// profiles = freshly launched with art already attached, trending = broad market.
async function trends() {
  const [boostTop, boostNew, profiles, cg] = await Promise.all([
    settled(getJSON('https://api.dexscreener.com/token-boosts/top/v1'), []),
    settled(getJSON('https://api.dexscreener.com/token-boosts/latest/v1'), []),
    settled(getJSON('https://api.dexscreener.com/token-profiles/latest/v1'), []),
    settled(getJSON('https://api.coingecko.com/api/v3/search/trending'), { coins: [] }),
  ]);

  const seen = new Map();
  const rows = [];
  const push = (t, src) => {
    const addr = t.tokenAddress;
    if (!addr) return;
    const k = t.chainId + ':' + addr.toLowerCase();
    if (seen.has(k)) { seen.get(k).sources.push(src); return; }
    const row = {
      key: k, chain: t.chainId, address: addr, url: t.url,
      icon: cdn(t.icon, 64, 64), header: cdn(t.header, 600, 200),
      description: (t.description || '').trim(),
      boost: t.totalAmount || t.amount || 0,
      links: Array.isArray(t.links) ? t.links.filter(l => l && l.url).map(l => ({ type: l.type || l.label || 'link', url: l.url })) : [],
      sources: [src],
    };
    seen.set(k, row);
    rows.push(row);
  };
  boostTop.forEach(t => push(t, 'boost-top'));
  boostNew.forEach(t => push(t, 'boost-new'));
  profiles.forEach(t => push(t, 'fresh'));

  // Enrich the top candidates with live market data (30 addresses per call).
  const byChain = new Map();
  for (const r of rows.slice(0, 90)) {
    if (!byChain.has(r.chain)) byChain.set(r.chain, []);
    byChain.get(r.chain).push(r);
  }
  await Promise.all([...byChain.entries()].map(async ([chain, list]) => {
    for (let i = 0; i < list.length; i += 30) {
      const slice = list.slice(i, i + 30);
      const addrs = slice.map(r => r.address).join(',');
      const data = await settled(getJSON('https://api.dexscreener.com/tokens/v1/' + chain + '/' + addrs), []);
      const best = new Map();
      for (const p of (Array.isArray(data) ? data : [])) {
        const a = p.baseToken && p.baseToken.address && p.baseToken.address.toLowerCase();
        if (!a) continue;
        const prev = best.get(a);
        const liq = (p.liquidity && p.liquidity.usd) || 0;
        if (!prev || liq > ((prev.liquidity && prev.liquidity.usd) || 0)) best.set(a, p);
      }
      for (const r of slice) {
        const p = best.get(r.address.toLowerCase());
        if (!p) continue;
        r.symbol = (p.baseToken && p.baseToken.symbol) || r.symbol;
        r.name = (p.baseToken && p.baseToken.name) || r.name;
        r.priceUsd = Number(p.priceUsd) || 0;
        r.fdv = p.marketCap || p.fdv || 0;
        r.liq = (p.liquidity && p.liquidity.usd) || 0;
        r.vol24 = (p.volume && p.volume.h24) || 0;
        const pc = p.priceChange || {};
        r.chg = { m5: pc.m5 ?? null, h1: pc.h1 ?? null, h6: pc.h6 ?? null, h24: pc.h24 ?? null };
        r.age = p.pairCreatedAt ? Date.now() - p.pairCreatedAt : null;
        r.buys = (p.txns && p.txns.h24 && p.txns.h24.buys) || 0;
        r.sells = (p.txns && p.txns.h24 && p.txns.h24.sells) || 0;
      }
    }
  }));

  // Heat = paid promotion + real volume relative to size + freshness.
  for (const r of rows) {
    const velocity = r.liq > 0 ? Math.min((r.vol24 || 0) / r.liq, 25) : 0;
    const hours = r.age ? r.age / 3.6e6 : 999;
    const fresh = hours < 72 ? 1 - hours / 72 : 0;
    r.heat = Math.round(
      Math.log10(1 + (r.boost || 0)) * 26 + velocity * 2.6 + fresh * 22 +
      Math.min(Math.log10(1 + (r.vol24 || 0)) * 5, 30) + (r.sources.length - 1) * 6
    );
  }
  rows.sort((a, b) => b.heat - a.heat);

  const coins = (cg.coins || []).map(c => {
    const it = c.item || {};
    const d = it.data || {};
    return {
      symbol: it.symbol, name: it.name, thumb: it.small || it.thumb, rank: it.market_cap_rank,
      chg: (d.price_change_percentage_24h && d.price_change_percentage_24h.usd) ?? null,
      vol: d.total_volume ?? null,
    };
  });
  return { at: Date.now(), rows: rows.slice(0, 120), words: wordCloud(rows), broad: coins };
}

const STOP = new Set(('the a an and or of to for is are be on in it its with this that you your we our they their not no as at by from has have had was were will would can could all any ' +
  'token tokens coin coins crypto community meme memecoin official project launch launched launching first new now here just only more most best but if so what when who how why about into over under ' +
  'solana ethereum base bnb binance eth sol btc bitcoin pump pumpfun dex chart contract supply tax lp dev team buy sell hold holders holder usd http https www com net io gg fun app bot ' +
  'one two three make makes made making get gets got going go goes do does did done up down out off than then them him her his she he i we us me my also been being very much many such own same other ' +
  'like dont doesnt isnt wont cant im its let lets youre were theyre thats whats heres theres').split(/\s+/));

function wordCloud(rows) {
  const counts = new Map();
  for (const r of rows.slice(0, 100)) {
    const text = ((r.name || '') + ' ' + (r.symbol || '') + ' ' + (r.description || '')).toLowerCase();
    const uniq = new Set(text.replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && w.length < 16 && !STOP.has(w) && !/^\d+$/.test(w)));
    for (const w of uniq) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts].filter(e => e[1] > 1).sort((a, b) => b[1] - a[1]).slice(0, 60)
    .map(e => ({ word: e[0], n: e[1] }));
}

// ---- disk -------------------------------------------------------------------
async function savePack(body) {
  const slug = String(body.slug || 'coin').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '').slice(0, 48) || 'coin';
  const d = new Date();
  const p2 = n => String(n).padStart(2, '0');
  const stamp = '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  const dir = path.join(OUT, slug + '-' + stamp);
  await fs.mkdir(dir, { recursive: true });
  const written = [];
  for (const f of body.files || []) {
    const name = path.basename(String(f.name || 'image.png')).replace(/[^A-Za-z0-9._-]+/g, '_');
    await fs.writeFile(path.join(dir, name), Buffer.from(String(f.data).split(',').pop(), 'base64'));
    written.push(name);
  }
  if (body.meta) await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(body.meta, null, 2));
  return { dir, written };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const send = (code, type, data, extra) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...ISOLATE, ...extra });
    res.end(data);
  };
  const json = (code, obj) => send(code, 'application/json; charset=utf-8', JSON.stringify(obj));
  try {
    if (u.pathname === '/api/trends') return json(200, await cached('trends', 60000, trends));

    if (u.pathname === '/api/ticker') { // is this symbol already taken?
      const q = (u.searchParams.get('q') || '').trim().replace(/^\$/, '');
      if (!q) return json(400, { error: 'q required' });
      const d = await cached('tk:' + q.toLowerCase(), 120000, () =>
        getJSON('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(q)));
      const hits = (d.pairs || []).filter(p => ((p.baseToken && p.baseToken.symbol) || '').toLowerCase() === q.toLowerCase());
      hits.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
      const seenName = new Set();
      const top = [];
      for (const p of hits) {
        const nm = (p.baseToken && p.baseToken.name) || '?';
        if (seenName.has(nm + p.chainId)) continue;
        seenName.add(nm + p.chainId);
        top.push({
          name: nm, chain: p.chainId, fdv: p.marketCap || p.fdv || 0,
          liq: (p.liquidity && p.liquidity.usd) || 0, vol24: (p.volume && p.volume.h24) || 0, url: p.url,
        });
        if (top.length >= 5) break;
      }
      return json(200, { q, taken: hits.length, top });
    }

    if (u.pathname === '/api/save' && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      return json(200, await savePack(JSON.parse(Buffer.concat(chunks).toString())));
    }

    if (u.pathname === '/api/reveal') { // open the pack folder in Explorer
      const dir = u.searchParams.get('dir') || OUT;
      if (!inside(OUT, dir)) return json(400, { error: 'outside out/' });
      spawn('explorer.exe', [path.resolve(dir)], { detached: true, stdio: 'ignore' }).unref();
      return json(200, { ok: true });
    }

    const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
    const file = path.join(ROOT, decodeURIComponent(rel));
    if (!inside(ROOT, file)) return send(403, 'text/plain', 'no');

    // The runtime and the models are ~80MB of immutable bytes. Re-sending them
    // on every reload is what makes a local tool feel slow, so they get a
    // revalidating ETag while the app's own source stays no-store.
    const st = await fs.stat(file);
    if (st.isDirectory()) return send(404, 'text/plain', 'not found');
    const big = /^(vendor|models|fonts)[\\/]/.test(rel);
    const etag = `"${st.size.toString(36)}-${st.mtimeMs.toString(36)}"`;
    if (big && req.headers['if-none-match'] === etag) {
      res.writeHead(304, { etag, ...ISOLATE });
      return res.end();
    }
    const buf = await fs.readFile(file);
    return send(200, MIME[path.extname(file)] || 'application/octet-stream', buf,
      big ? { etag, 'cache-control': 'public, max-age=31536000, immutable' } : undefined);
  } catch (e) {
    if (e && ['ENOENT', 'EISDIR', 'ENOTDIR', 'EINVAL'].includes(e.code)) return send(404, 'text/plain', 'not found');
    return json(500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => console.log('MemeForge  ->  http://localhost:' + PORT));
