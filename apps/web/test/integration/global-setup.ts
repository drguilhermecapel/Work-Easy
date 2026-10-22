import type { TestProject } from 'vitest/node';
import { resolveStack, type StackEnv } from './support/env';

declare module 'vitest' {
  export interface ProvidedContext {
    stack: StackEnv;
  }
}

// Roda uma vez, antes de qualquer arquivo: falha cedo e com mensagem clara se a
// stack não está de pé, e entrega URL e chaves aos testes por `inject('stack')`.
export default async function setup(project: TestProject): Promise<void> {
  project.provide('stack', await resolveStack());
}
