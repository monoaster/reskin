// Renders a style at a few moments and writes one contact sheet PNG, so you can look at it.
//   node scripts/preview.mjs <style> <out.png> [--times 0.2,1,2.5] [--size 360] [--cols 5]
// <style> is a file name in src/styles without .js, for example 01-pixel. Needs Node 22+ and Google Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const style = args[0], out = args[1];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i > 0 ? args[i + 1] : d; };
if (!style || !out) { console.error('usage: node scripts/preview.mjs <style> <out.png> [--times a,b,c] [--size 360] [--cols 5]'); process.exit(1); }
const size = +opt('size', 360), cols = +opt('cols', 5);
const times = opt('times', '0.2,0.6,1.0,1.4,1.8,2.2,2.5,2.9,3.15');
const n = times.split(',').length;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root)) throw 0;
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const dir = await mkdtemp(path.join(tmpdir(), 'reskin-'));
const port = 9600 + Math.floor(Math.random() * 300);
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, '--hide-scrollbars', `--user-data-dir=${dir}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  } catch { ws = null; await sleep(200); }
}
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

const rows = Math.ceil(n / cols), W = cols * (size + 6) + 6, H = rows * (size + 6) + 6;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const errors = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' ')); });
await send('Page.navigate', { url: `${base}/scripts/preview.html?style=${style}&size=${size}&times=${times}` });
for (let i = 0; i < 100; i++) { await sleep(150); if (await ev('window.__done === true')) break; }
const r = await send('Page.captureScreenshot', { format: 'png' });
await writeFile(out, Buffer.from(r.result.data, 'base64'));
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
console.log('wrote', out);
ws.close(); chrome.kill(); server.close(); await rm(dir, { recursive: true, force: true }).catch(() => {});
process.exit(errors.length ? 2 : 0);
