import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes de integração: falam com a stack Supabase real (supabase start), sem
// mocks. Não entram em `npm test`; rodam com `npm run test:integration`.
// Serial de propósito: os arquivos compartilham um banco, a cota de logins do
// Auth e um "mundo" de dados de teste que cada arquivo cria e remove.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['./test/integration/global-setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 600_000,
    fileParallelism: false,
    maxWorkers: 1,
    sequence: { concurrent: false },
    retry: 0,
  },
});
