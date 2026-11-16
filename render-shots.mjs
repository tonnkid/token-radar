// Render the token-radar dashboard's three screenshots from the built /output page.
// Chrome headless with a real WebSocket CDP session: the page is a static file, so we load it with
// file://, wait for the board table to exist, then capture at 1440x1000 (the gate's long-side cap).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';

const HERE = resolve(new URL('.', import.meta.url).pathname);
const OUT = join(HERE, 'out');
const PAGE = join(OUT, 'dashboard', 'index.html');
const SHOTS = join(HERE, 'screenshots');

if (!existsSync(PAGE)) {
  console.error('missing', PAGE, '- run main.ts first');
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const CHROME = '/usr/bin/google-chrome';
const PORT = 9224;

const chrome = spawn(CHROME, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  '--window-size=1440,1000',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cdpUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome CDP never came up');
}

const wsUrl = await cdpUrl();
const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
let nextId = 1;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve: res, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else res(msg.result);
  }
});
await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((res, rej) => {
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' timeout')); } }, 30000);
  });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

async function goto(url) {
  await send('Page.navigate', { url });
  await sleep(1200);
}

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

async function shot(name) {
  await sleep(500);
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const buf = Buffer.from(data, 'base64');
  writeFileSync(join(SHOTS, name), buf);
  console.log(`${name} ${Math.round(buf.length / 1024)} KiB`);
  return buf.length;
}

// 1. The board, top of the table.
await goto('file://' + PAGE);
const rows = await evalJs('document.querySelectorAll("tbody tr").length');
console.log('rows rendered:', rows);
if (!rows) throw new Error('board table never rendered');
await shot('1-board.png');

// 2. A detail view: open the first row's drawer.
await evalJs(`
  (function(){
    var tr = document.querySelector('tbody tr');
    if (!tr) throw new Error('no row');
    tr.click();
    return true;
  })()
`);
await sleep(700);
await shot('2-detail.png');
await evalJs(`(function(){var d=document.getElementById('detail'); if(d&&d.open) d.close(); return true})()`);
await sleep(400);

// 3. A filtered view: pick a category, which exercises the filter and the count.
await evalJs(`
  (function(){
    var sel = document.querySelector('select');
    if (!sel) throw new Error('no category select');
    var opts = Array.from(sel.options).filter(function(o){ return o.value && o.value !== 'all'; });
    if (!opts.length) throw new Error('no categories');
    opts[opts.length - 1].selected = true;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opts[opts.length - 1].value;
  })()
`);
await sleep(700);
await shot('3-filtered.png');

const errors = await evalJs('(window.__errs||[]).length');
ws.close();
chrome.kill('SIGKILL');
console.log('done, js errors:', errors);
