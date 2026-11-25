// Inspect the installed debug WebView. Keyboard input goes through Android.
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta ADB inválida');

let target;
for (let i = 0; i < 40 && !target; i++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    const pages = await response.json();
    target = pages.find(page => page.type === 'page' && new URL(page.url).origin === 'https://localhost');
  } catch {
    // The app process may start before the WebView creates its debugging socket.
  }
  if (!target) await delay(500);
}
if (!target) throw new Error('WebView de https://localhost indisponível');

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});

let id = 0;
async function command(method, params) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    socket.onmessage = event => {
      const result = JSON.parse(event.data);
      if (result.id !== requestId) return;
      if (result.error) reject(new Error(result.error.message));
      else resolve(result.result);
    };
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function tap(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    element.scrollIntoView({ block: 'center' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  await command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function waitFor(expression, failure) {
  for (let i = 0; i < 40; i++) {
    if (await evaluate(expression)) return;
    await delay(500);
  }
  const state = await evaluate(`({ hash: location.hash, heading: document.querySelector('main h1')?.textContent,
    input: document.querySelector('main input')?.value, focused: document.activeElement.tagName })`);
  throw new Error(failure + ' ' + JSON.stringify(state));
}

try {
  const selector = 'input[aria-label="O que você precisa?"]';
  await waitFor(`document.querySelector('${selector}')?.getBoundingClientRect().height > 0`, 'Campo de busca da Home indisponível');
  await tap(selector);
  await waitFor(`document.activeElement.matches('${selector}')`, 'O toque não focou a busca');
  execFileSync('adb', ['shell', 'input', 'text', 'limpeza']);
  await waitFor(`document.querySelector('${selector}').value.toLowerCase() === 'limpeza'`, 'O campo não recebeu o texto do teclado');
  await tap('form button[type="submit"]');
  await waitFor(`location.hash.toLowerCase().includes('/search?q=limpeza') &&
    document.querySelector('main h1')?.textContent.toLowerCase().includes('limpeza')`, 'A busca não abriu os resultados');
  console.log('Busca por teclado confirmada no WebView instalado.');
} finally {
  socket.close();
}
