// Render a contact sheet of every template at full size, straight through the
// app's own module, so defects are visible at real resolution.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
const SCRATCH = import.meta.dirname;
const PORT = 9335;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(SCRATCH, 'cdp-sheet')}`,
  '--no-first-run', '--no-default-browser-check', '--window-size=1200,900',
  'http://localhost:4477/generator.html',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (m, p = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
for (let i = 0; i < 60; i++) {
  try {
    const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
    const pg = l.find(t => t.type === 'page' && t.url.startsWith('http'));
    if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(300);
}
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
});
await send('Runtime.enable');
await sleep(2500);

const variants = [
  { tag: 'emoji', state: { ticker: 'FROGGO', name: 'dog with hat', tagline: 'he has a hat', emoji: '\u{1F438}' } },
  { tag: 'textonly', state: { ticker: 'GIGACHAD', name: 'peak performance', tagline: 'yes', emoji: '' } },
  { tag: 'longname', state: { ticker: 'WIF', name: 'dog wif hat forever', tagline: 'the original', emoji: '\u{1F9E2}' } },
];

for (const v of variants) {
  const expr = `(async () => {
    const T = await import('./templates.js?v=${Date.now()}');
    const SZ = 480, COLS = 4, ROWS = 3, PAD = 10;
    const sheet = document.createElement('canvas');
    sheet.width = COLS * (SZ + PAD) + PAD;
    sheet.height = ROWS * (SZ + PAD + 22) + PAD;
    const s = sheet.getContext('2d');
    s.fillStyle = '#14161c'; s.fillRect(0, 0, sheet.width, sheet.height);
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    T.TEMPLATES.forEach((t, i) => {
      const col = i % COLS, row = (i / COLS) | 0;
      T.render(cv, Object.assign({}, ${JSON.stringify(v.state)}, {
        template: t.id, pal: T.PALETTES[${JSON.stringify(v.tag)} === 'textonly' ? 3 : 0],
        seed: 7, transparent: false, bitmap: null, _cache: {},
      }));
      const x = PAD + col * (SZ + PAD), y = PAD + row * (SZ + PAD + 22);
      s.drawImage(cv, x, y);
      s.fillStyle = '#9aa4b8'; s.font = '13px Consolas';
      s.fillText((i + 1) + '. ' + t.label, x + 2, y + SZ + 15);
    });
    return sheet.toDataURL('image/png');
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) { console.error(v.tag, r.exceptionDetails.exception?.description); continue; }
  await fs.writeFile(path.join(SCRATCH, `sheet-${v.tag}.png`), Buffer.from(r.result.value.split(',')[1], 'base64'));
  console.log('wrote sheet-' + v.tag + '.png');
}

// banner sheet (wide layout check)
const bexpr = `(async () => {
  const T = await import('./templates.js?v=${Date.now()}');
  const W = 900, H = 300, PAD = 10;
  const sheet = document.createElement('canvas');
  sheet.width = 2 * (W + PAD) + PAD;
  sheet.height = 6 * (H + PAD + 20) + PAD;
  const s = sheet.getContext('2d');
  s.fillStyle = '#14161c'; s.fillRect(0, 0, sheet.width, sheet.height);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  T.TEMPLATES.forEach((t, i) => {
    const col = i % 2, row = (i / 2) | 0;
    T.render(cv, { ticker: 'FROGGO', name: 'dog with hat', tagline: 'he has a hat', emoji: '\\u{1F438}',
      template: t.id, pal: T.PALETTES[0], seed: 7, transparent: false, bitmap: null, _cache: {} });
    const x = PAD + col * (W + PAD), y = PAD + row * (H + PAD + 20);
    s.drawImage(cv, x, y);
    s.fillStyle = '#9aa4b8'; s.font = '13px Consolas';
    s.fillText((i + 1) + '. ' + t.label, x + 2, y + H + 14);
  });
  return sheet.toDataURL('image/png');
})()`;
const rb = await send('Runtime.evaluate', { expression: bexpr, awaitPromise: true, returnByValue: true });
if (rb.exceptionDetails) console.error('banner', rb.exceptionDetails.exception?.description);
else { await fs.writeFile(path.join(SCRATCH, 'sheet-banner.png'), Buffer.from(rb.result.value.split(',')[1], 'base64')); console.log('wrote sheet-banner.png'); }

chrome.kill();
process.exit(0);
