## O que muda

<!-- Descreva a mudança e o motivo. Se mexe em regra de negócio, diga qual. -->

## Checklist

- [ ] Testes: `npx tsc --noEmit -p .`, `npx eslint <caminhos alterados> --max-warnings 0` e `npx vitest run <arquivos afetados>` passam em `apps/web`.
- [ ] Alegações: `npx vitest run test/claims-guard.test.ts` passa, e nenhum texto novo para pessoas promete o que o produto não entrega.
- [ ] Migrations e pgTAP: nenhuma migration existente foi editada (só migrations novas, com prefixo próprio); `npx supabase test db` passou; `lib/database.types.ts` foi regenerado se o esquema mudou.
- [ ] Cabeçalhos: se `apps/web/public/_headers` mudou, `node scripts/check-headers.mjs` passa.
- [ ] Documentação: `apps/web/docs/` foi atualizada se o contrato, a decisão ou a infraestrutura mudou.
- [ ] Sem segredo: o diff não tem chave, token, senha, arquivo `.env` nem dado pessoal real, e nenhuma variável `VITE_*` carrega segredo.
- [ ] Workflows: nenhum workflow novo roda em `push` ou `pull_request` sem decisão registrada.
- [ ] Histórico: depois de uma revisão, os commits novos são adicionados em vez de reescrever o histórico (sem force-push).
