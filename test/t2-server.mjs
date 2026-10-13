// Test 2: server endpoints, input validation, path containment, caching.
import fs from 'node:fs';
import path from 'node:path';
const B = 'http://localhost:4477';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out');
const fails = [];
const ok = (cond, label, detail = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (detail ? '  [' + detail + ']' : ''));
  if (!cond) fails.push(label + ' ' + detail);
};
const get = async (p, opt) => {
  const r = await fetch(B + p, opt);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, type: r.headers.get('content-type') || '', text, json };
};

console.log('static + mime');
ok((await get('/')).status === 200, 'GET / is 200');
ok((await get('/')).type.includes('text/html'), 'index is text/html');
ok((await get('/app.js')).type.includes('javascript'), 'app.js is javascript');
ok((await get('/style.css')).type.includes('text/css'), 'style.css is text/css');
ok((await get('/nope.js')).status === 404, 'missing file is 404');
ok((await get('/out')).status === 404, 'directory read is not 200');

console.log('path containment');
for (const p of ['/../CLAUDE.md', '/..%2f..%2f.claude/CLAUDE.md', '/%2e%2e/%2e%2e/.bashrc',
  '/....//server.mjs', '/..\\..\\.claude\\CLAUDE.md']) {
  const r = await get(p);
  ok(r.status === 403 || r.status === 404, 'traversal blocked ' + p, 'status ' + r.status);
}

console.log('ticker lookup');
ok((await get('/api/ticker')).status === 400, 'missing q is 400');
ok((await get('/api/ticker?q=')).status === 400, 'empty q is 400');
{
  const r = await get('/api/ticker?q=%24SOL');
  ok(r.status === 200 && r.json && r.json.q === 'SOL', 'leading $ is stripped', JSON.stringify(r.json && r.json.q));
  ok(r.json && typeof r.json.taken === 'number' && Array.isArray(r.json.top), 'shape is {taken, top[]}');
}
{
  const r = await get('/api/ticker?q=' + encodeURIComponent('<script>"&\'' ));
  ok(r.status === 200, 'hostile q does not 500', 'status ' + r.status);
}
{
  const r = await get('/api/ticker?q=' + 'A'.repeat(300));
  ok(r.status === 200 || r.status === 400, 'very long q handled', 'status ' + r.status);
}

console.log('trends');
{
  const t0 = Date.now();
  const a = await get('/api/trends');
  const t1 = Date.now();
  const b = await get('/api/trends');
  const t2 = Date.now();
  ok(a.status === 200 && Array.isArray(a.json.rows), 'trends returns rows');
  ok(a.json.rows.every(r => r.chain && r.address && typeof r.heat === 'number'), 'every row has chain/address/heat');
  ok(a.json.rows.every(r => !r.icon || /^https:\/\//.test(r.icon)), 'icons are absolute https URLs');
  ok(a.json.rows.every((r, i, arr) => i === 0 || arr[i - 1].heat >= r.heat), 'rows sorted by heat desc');
  ok(Array.isArray(a.json.words) && a.json.words.every(w => w.word && w.n > 1), 'word cloud shape');
  ok((t2 - t1) < Math.max(40, (t1 - t0) / 4), 'second call served from cache', (t1 - t0) + 'ms then ' + (t2 - t1) + 'ms');
  const dupes = new Set(a.json.rows.map(r => r.key)).size !== a.json.rows.length;
  ok(!dupes, 'no duplicate rows');
}

console.log('save');
const px = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
{
  const r = await get('/api/save', {
    method: 'POST',
    body: JSON.stringify({ slug: 'TEST/../../escape me!', files: [{ name: '../../evil.png', data: px }], meta: { x: 1 } }),
  });
  ok(r.status === 200, 'save returns 200');
  const dir = r.json.dir;
  ok(path.resolve(dir).startsWith(path.resolve(OUT) + path.sep), 'pack dir stays inside out/', dir);
  const files = fs.readdirSync(dir);
  ok(files.includes('evil.png') && !files.some(f => f.includes('..')), 'filename is basenamed', files.join(','));
  ok(!fs.existsSync(path.join(OUT, '..', 'evil.png')), 'nothing written outside out/');
  ok(fs.existsSync(path.join(dir, 'meta.json')), 'meta.json written');
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const r = await get('/api/save', { method: 'POST', body: '{ not json' });
  ok(r.status === 500 || r.status === 400, 'malformed body does not crash server', 'status ' + r.status);
}
{
  const r = await get('/api/save', { method: 'POST', body: JSON.stringify({ slug: 'empty', files: [] }) });
  ok(r.status === 200 && r.json.written.length === 0, 'empty file list handled');
  if (r.json && r.json.dir) fs.rmSync(r.json.dir, { recursive: true, force: true });
}
{
  const r = await get('/api/save', { method: 'POST', body: JSON.stringify({ files: [{ name: 'a.png', data: 'not base64 at all!!' }] }) });
  ok(r.status === 200 || r.status === 500, 'garbage image data does not hang', 'status ' + r.status);
  if (r.json && r.json.dir) fs.rmSync(r.json.dir, { recursive: true, force: true });
}
ok((await get('/api/save')).status === 404, 'GET /api/save is not a save');

console.log('reveal containment');
for (const d of [path.dirname(ROOT), ROOT, path.join(ROOT, 'outside'),
  path.join(ROOT, 'out') + '/../..', 'C:/Windows']) {
  const r = await get('/api/reveal?dir=' + encodeURIComponent(d));
  ok(r.status === 400, 'reveal rejects ' + d, 'status ' + r.status);
}

console.log('server still healthy after all of that');
ok((await get('/')).status === 200, 'server alive at the end');

console.log(fails.length ? '\nFAILURES (' + fails.length + '):\n' + fails.join('\n') : '\nALL TEST-2 CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
