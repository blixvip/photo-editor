// Shared CDP harness: launch headless Chrome, attach, expose evaluate/screenshot.
import { spawn } from 'node:child_process';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ port, profile, url, scratch, size = '1680,1300' }) {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new', `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(scratch, profile)}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    `--window-size=${size}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    url,
  ], { stdio: 'ignore' });

  let ws;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page' && t.url.startsWith('http'));
      if (pg && pg.webSocketDebuggerUrl) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(250);
  }
  if (!ws) { chrome.kill(); throw new Error('no page target'); }
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

  const evaluate = async (expression, { quiet = false } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      const msg = r.exceptionDetails.exception?.description || r.exceptionDetails.text;
      if (quiet) return { __error: msg };
      throw new Error('eval: ' + msg);
    }
    return r.result.value;
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  return { chrome, send, evaluate, logs, close: () => { try { ws.close(); } catch {} chrome.kill(); } };
}
