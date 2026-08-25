import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const executable = resolve('src-tauri/target/release/vibepbl-desktop.exe');
const port = 9333;
const app = spawn(executable, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'ignore',
  windowsHide: true
});

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

async function findPage() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
      const page = pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl && item.url && item.url !== 'about:blank');
      if (page) return page;
    } catch { /* WebView is still starting. */ }
    await delay(250);
  }
  throw new Error('The native WebView did not expose a debug target.');
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolveResult, rejectResult } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectResult(new Error(message.error.message));
    else resolveResult(message.result);
  });
  return {
    send(method, params = {}) {
      const requestId = ++id;
      socket.send(JSON.stringify({ id: requestId, method, params }));
      return new Promise((resolveResult, rejectResult) => pending.set(requestId, { resolveResult, rejectResult }));
    },
    close: () => socket.close()
  };
}

try {
  const page = await findPage();
  const client = await connect(page.webSocketDebuggerUrl);
  let bridge;
  for (let attempt = 0; attempt < 40; attempt++) {
    bridge = await client.send('Runtime.evaluate', {
      expression: `({ readyState: document.readyState, hasTauri: Boolean(window.__TAURI__), hasInvoke: typeof window.__TAURI__?.core?.invoke === 'function' })`,
      returnByValue: true
    });
    if (bridge.result.value?.readyState === 'complete' && bridge.result.value?.hasInvoke) break;
    await delay(250);
  }
  const session = await client.send('Runtime.evaluate', {
    expression: `(async () => { const value = await window.__TAURI__.core.invoke('get_session'); return { id: value.id, title: value.title }; })()`,
    awaitPromise: true,
    returnByValue: true
  });
  const result = { page: { title: page.title, url: page.url }, bridge: bridge.result.value, session: session.result.value };
  if (!result.bridge.hasTauri || !result.bridge.hasInvoke || result.session.id !== 1) {
    throw new Error(`Native bridge check failed: ${JSON.stringify(result)}`);
  }
  console.log(`Native bridge OK: ${JSON.stringify(result)}`);
  client.close();
} finally {
  app.kill();
}
