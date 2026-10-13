// Shared CDP harness: launch headless Chrome, attach, expose evaluate/screenshot.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Every chrome.exe running on one profile directory. Chrome relaunches itself, so the real browser is not our child,
// and a browser still alive on a profile makes the next launch hand off to it and exit (no debugging port: the
// flaky "no page target"). -EncodedCommand because node's quoting of a -Command string with quotes broke the filter.
function killProfile(dir) {
  if (process.platform !== 'win32') return;
  const d = dir.replace(/'/g, "''");
  const ps = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${d}') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { stdio: 'ignore', timeout: 20000 });
}

// The real browser process on a profile (no --type= switch): its process tree is the whole browser.
function browserPid(dir) {
  if (process.platform !== 'win32') return null;
  const d = dir.replace(/'/g, "''");
  const ps = `(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${d}') -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1).ProcessId`;
  const r = spawnSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { encoding: 'utf8', timeout: 20000 });
  const pid = parseInt(String(r.stdout || '').trim(), 10);
  return pid > 0 ? pid : null;
}

export async function launch({ port, profile, url, scratch, size = '1680,1300' }) {
  const dir = path.join(scratch, profile);
  killProfile(dir);
  // A profile a previous run could not delete (Windows releases its files late) goes now: a fresh one each run.
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--window-size=${size}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    url,
  ], { stdio: 'ignore' });

  let ws, blank = null;
  for (let i = 0; i < 120; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page' && t.url.startsWith('http'));
      if (pg && pg.webSocketDebuggerUrl) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
      // Under memory pressure the start URL sometimes never loads: the tab sits on about:blank. Drive it there.
      const b = list.find(t => t.url === 'about:blank' && t.webSocketDebuggerUrl);
      if (b && i >= 16) { blank = b; ws = new WebSocket(b.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(250);
  }
  if (!ws) { killProfile(dir); throw new Error('no page target'); }
  await new Promise(r => ws.addEventListener('open', r));

  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push('EXCEPTION ' + (d.exception?.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber);
    }
    if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
      logs.push(m.params.type + ': ' + m.params.args.map(a => a.description || a.value).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      logs.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });

  const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

  const raw = async (expression, quiet) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
      if (quiet) return { __error: msg };
      throw new Error('eval: ' + msg);
    }
    return r.result.value;
  };
  // A string over ~1MB (a PNG data URL of a contact sheet is 4-5MB) never arrives in one CDP message: the call just
  // hangs. Such strings, the result itself or a field of a result object, are parked in the page and pulled across
  // in 512KB slices.
  const CHUNK = 512 * 1024;
  const evaluate = async (expression, { quiet = false } = {}) => {
    const wrapped = `(async () => { const v = await (0, eval)(${JSON.stringify(expression)});
      const big = (x) => typeof x === 'string' && x.length > ${CHUNK};
      window.__cdpBig = {};
      if (big(v)) { window.__cdpBig.$ = v; return { __cdpBig: { $: v.length } }; }
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).some(big)) {
        const o = {}, refs = {};
        for (const [k, x] of Object.entries(v)) if (big(x)) { window.__cdpBig[k] = x; refs[k] = x.length; } else o[k] = x;
        return { __cdpBig: refs, rest: o };
      }
      return v; })()`;
    const v = await raw(wrapped, quiet);
    if (!v || typeof v !== 'object' || !v.__cdpBig || typeof v.__cdpBig !== 'object') return v;
    const pull = async (k, n) => {
      let out = '';
      for (let i = 0; i < n; i += CHUNK) out += await raw(`window.__cdpBig[${JSON.stringify(k)}].slice(${i}, ${i + CHUNK})`, false);
      return out;
    };
    let res;
    if ('$' in v.__cdpBig) res = await pull('$', v.__cdpBig.$);
    else { res = { ...v.rest }; for (const [k, n] of Object.entries(v.__cdpBig)) res[k] = await pull(k, n); }
    await raw('delete window.__cdpBig', true);
    return res;
  };

  // The app's "open the folder in Explorer" after a save is skipped under test (it popped windows on the desktop).
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__mfTest = true;' });
  await send('Runtime.evaluate', { expression: 'window.__mfTest = true;' });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  if (blank) await send('Page.navigate', { url });
  // Hand the page over loaded: under memory pressure the first evaluate ran before the app's modules ("MF is not
  // defined").
  for (let i = 0; i < 80; i++) {
    const r = await send('Runtime.evaluate', { expression: "location.href.startsWith('http') && document.readyState === 'complete'", returnByValue: true }).catch(() => null);
    if (r?.result?.value === true) break;
    await sleep(250);
  }
  const realPid = browserPid(dir);
  // close() also deletes the throwaway Chrome profile (50-60MB each; nine tests left ~1GB behind on a full C:).
  const close = () => {
    try { ws.close(); } catch {}
    // The browser's own tree first (fast, exact); the profile sweep only if that pid was not found.
    if (realPid) spawnSync('taskkill', ['/F', '/T', '/PID', String(realPid)], { stdio: 'ignore', timeout: 10000 });
    else killProfile(dir);
    if (process.platform !== 'win32') chrome.kill();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
    // Windows keeps the profile folder locked (EPERM) for a while after the browser is gone, longer than a test should
    // wait. A hidden background node process finishes the delete after this one has exited.
    if (fs.existsSync(dir)) {
      const code = `setTimeout(() => { try { require('fs').rmSync(${JSON.stringify(dir)}, { recursive: true, force: true, maxRetries: 60, retryDelay: 500 }); } catch {} }, 2000)`;
      spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
  };
  return { chrome, send, evaluate, logs, close };
}
