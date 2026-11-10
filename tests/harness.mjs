// Shared headless-Chrome harness (CDP over WebSocket, no dependencies).
import { spawn } from 'node:child_process';
import { createEditorServer } from '../scripts/static-server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function launch({ port = 0, debugPort = 0, fileProtocol = false } = {}) {
  const ROOT = path.resolve(import.meta.dirname, '..');
  const server = createEditorServer().listen(port, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  port = server.address().port;
  const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
  if (!chromePath) throw new Error('Chrome not found');
  const userDir = fs.mkdtempSync(path.join(ROOT, 'tests', '.chrome-profile-'));
  const chrome = spawn(chromePath, ['--headless=new', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${userDir}`, '--no-first-run', '--window-size=1600,1000', 'about:blank'], { stdio: 'ignore' });
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function getWs() { for (let i = 0; i < 60; i++) { try { if (!debugPort) debugPort = +fs.readFileSync(path.join(userDir, 'DevToolsActivePort'), 'utf8').split('\n')[0]; const r = await fetch(`http://127.0.0.1:${debugPort}/json`, { signal: AbortSignal.timeout(1500) }); const list = await r.json(); const page = list.find(t => t.type === 'page'); if (page) return page.webSocketDebuggerUrl; } catch (e) { } await sleep(250); } chrome.kill(); server.close(); throw new Error('Chrome did not start'); }
  let id = 0; const pending = new Map(); const logs = []; const errors = [];
  const ws = new WebSocket(await getWs()); await new Promise(r => ws.onopen = r);
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method === 'Runtime.consoleAPICalled') { const txt = m.params.args.map(a => a.value ?? a.description ?? '').join(' '); logs.push(`[${m.params.type}] ${txt}`); if (m.params.type === 'error') errors.push(txt); } else if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push(`EXCEPTION: ${d.exception?.description || d.text} @ ${d.url}:${d.lineNumber}`); } };
  const send = (method, params = {}) => new Promise((res, reject) => { const i = ++id; const timer = setTimeout(() => { pending.delete(i); reject(new Error('Timed out: ' + method)); }, 90000); pending.set(i, result => { clearTimeout(timer); res(result); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  const url = fileProtocol ? pathToFileURL(path.join(ROOT, 'index.html')).href : `http://127.0.0.1:${port}/index.html`;
  await send('Page.navigate', { url });
  const bootDeadline = Date.now() + 30000;
  while (!await evalJs("typeof Cmd === 'object' && document.body && !document.body.classList.contains('booting')")) {
    if (Date.now() > bootDeadline) {
      chrome.kill(); server.close();
      throw Error('Editor did not finish startup: ' + errors.join('; '));
    }
    await sleep(100);
  }
  const results = [];
  const check = async (name, expr) => { console.log('Checking: ' + name); try { const v = await evalJs(expr); if (v !== true) console.log('Editor status:', await evalJs("[...document.querySelectorAll('.toast')].map(el => el.textContent).join(' | ')")); results.push([name, v === true ? 'PASS' : 'FAIL: ' + JSON.stringify(v)]); } catch (e) { results.push([name, 'ERROR: ' + e.message]); } };
  const done = async () => {
    const exited = new Promise(resolve => chrome.exitCode !== null || chrome.signalCode ? resolve() : chrome.once('exit', resolve));
    ws.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
    const fallback = setTimeout(() => chrome.kill(), 4000);
    await exited; clearTimeout(fallback); ws.close(); server.close();
    if (path.dirname(userDir) !== path.join(ROOT, 'tests') || !path.basename(userDir).startsWith('.chrome-profile-')) throw Error('Unexpected profile path');
    await fs.promises.rm(userDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
  };
  return { evalJs, check, results, logs, errors, done, sleep, send };
}
