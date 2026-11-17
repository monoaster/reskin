// Opens every file in examples/ and gallery.html in headless Chrome and reports page errors.
//   node scripts/check-examples.mjs
import { spawn } from 'node:child_process';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [...(await readdir(path.join(root, 'examples'))).filter((f) => f.endsWith('.html')).map((f) => `examples/${f}`), 'gallery.html'];
const dir = await mkdtemp(path.join(tmpdir(), 'reskin-chk-'));
const port = 9400 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  } catch { ws = null; await sleep(200); }
}
let id = 0, errors = [];
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description?.split('\n').slice(0, 2).join(' | ') || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
send('Runtime.enable'); send('Page.enable');
let bad = 0;
for (const p of pages) {
  errors = [];
  send('Page.navigate', { url: `file://${path.join(root, p)}` });
  await sleep(1800);
  console.log(errors.length ? `FAIL ${p}\n   ${[...new Set(errors)].join('\n   ')}` : `ok   ${p}`);
  if (errors.length) bad++;
}
ws.close(); chrome.kill(); await rm(dir, { recursive: true, force: true }).catch(() => {});
process.exit(bad ? 1 : 0);
