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
async function evaluate(expression) {
  const requestId = ++id;
  return new Promise((resolve, reject) => {
    socket.onmessage = event => {
      const result = JSON.parse(event.data);
      if (result.id !== requestId) return;
      if (result.error || result.result.exceptionDetails) reject(new Error('Erro ao consultar o WebView'));
      else resolve(result.result.result.value);
    };
    socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
}

async function waitFor(expression, failure) {
  for (let i = 0; i < 40; i++) {
    if (await evaluate(expression)) return;
    await delay(500);
  }
  throw new Error(failure);
}

try {
  await waitFor(`(() => {
    const input = document.querySelector('input[aria-label="O que você precisa?"]');
    if (!input || !input.getBoundingClientRect().height) return false;
    input.focus();
    return document.activeElement === input;
  })()`, 'Campo de busca da Home indisponível');
  execFileSync('adb', ['shell', 'input', 'text', 'limpeza']);
  execFileSync('adb', ['shell', 'input', 'keyevent', 'KEYCODE_ENTER']);
  await waitFor(`location.hash.includes('/search?q=limpeza') &&
    document.querySelector('h1')?.textContent.includes('limpeza')`, 'A busca não abriu os resultados');
  console.log('Busca por teclado confirmada no WebView instalado.');
} finally {
  socket.close();
}
