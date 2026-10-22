// Descobre a URL e as chaves da stack Supabase local (ou de CI).
//
// Ordem: variáveis de ambiente SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e
// SUPABASE_SERVICE_ROLE_KEY; se alguma faltar, `npx supabase status -o env`.
// A chave de serviço existe só aqui, em código de teste: nunca no app.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface StackEnv {
  url: string;
  publishableKey: string;
  serviceRoleKey: string;
}

const APP_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const STACK_DOWN_HELP = [
  'A stack Supabase local não está de pé, então o teste de integração não tem com quem falar.',
  'Suba com `npx supabase start` (em apps/web) e rode de novo, ou exporte',
  'SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e SUPABASE_SERVICE_ROLE_KEY.',
].join(' ');

/** Lê linhas `CHAVE="valor"` da saída de `supabase status -o env`, ignorando avisos. */
export const parseEnvOutput = (output: string): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;
    values[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return values;
};

const readStatus = (): Record<string, string> => {
  let output: string;
  try {
    output = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'env'], {
      cwd: APP_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw new Error(`${STACK_DOWN_HELP} (supabase status falhou: ${detail})`, { cause: error });
  }
  return parseEnvOutput(output);
};

export const resolveStack = async (): Promise<StackEnv> => {
  const fromEnv = {
    url: process.env.SUPABASE_URL?.trim(),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY?.trim(),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  };

  let { url, publishableKey, serviceRoleKey } = fromEnv;
  if (!url || !publishableKey || !serviceRoleKey) {
    const status = readStatus();
    url = url || status.API_URL;
    publishableKey = publishableKey || status.PUBLISHABLE_KEY || status.ANON_KEY;
    serviceRoleKey = serviceRoleKey || status.SERVICE_ROLE_KEY;
  }
  if (!url || !publishableKey || !serviceRoleKey) {
    throw new Error(`${STACK_DOWN_HELP} (faltam: ${[
      !url && 'URL',
      !publishableKey && 'chave publicável',
      !serviceRoleKey && 'chave de serviço',
    ].filter(Boolean).join(', ')})`);
  }

  // Confere que alguém responde no endereço antes de começar a criar usuários.
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: publishableKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${STACK_DOWN_HELP} (sem resposta em ${url}: ${detail})`, { cause: error });
  }

  return { url, publishableKey, serviceRoleKey };
};
