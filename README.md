# WorkEasy

Plataforma para encontrar e contratar serviços e profissionais liberais de todas as áreas e categorias, de reformas e limpeza a aulas, beleza, tecnologia, cuidados e saúde.

> **Status: protótipo de demonstração.** Todos os dados são fictícios. Não há backend, login real, pagamento, verificação de identidade, chat, vídeo, teleconsulta nem prontuário em funcionamento. Nada do que se digita é enviado ou armazenado. Não use para atendimento real.

## O que existe hoje

- Catálogo de 15 categorias e cerca de 170 subcategorias de serviços e profissões.
- Busca por texto (ignora acentos e maiúsculas) e por categoria.
- Perfis de prestadores e de profissionais de saúde, com agenda de demonstração.
- Painéis de cliente, prestador e profissional de saúde, alternados pelo seletor de papel no menu.
- Telas de demonstração de teleconsulta e prontuário, marcadas como funcionalidade futura.

## Rodar localmente

Requer Node.js 22.

```bash
npm ci          # instala exatamente as versões do package-lock.json
npm run dev     # http://localhost:3000
```

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Typecheck e build de produção em `dist/` |
| `npm run preview` | Serve o build de produção |
| `npm run lint` | ESLint, sem avisos tolerados |
| `npm run typecheck` | TypeScript em modo estrito |
| `npm test` | Testes com Vitest |

O `.npmrc` liga `legacy-peer-deps` por causa de um bug do npm 10 ao resolver os pares opcionais do Vitest; os pares necessários estão declarados explicitamente no `package.json`.

## Segurança e alegações

- **Nenhum segredo no cliente.** Variáveis `VITE_*` vão para o JavaScript público. Chaves de API, tokens e senhas pertencem a funções de servidor. O CI falha se encontrar uma chave no bundle.
- **Nenhuma alegação sem implementação.** O teste `test/claims-guard.test.ts` falha se o código voltar a anunciar criptografia ponta a ponta, assinatura digital, selo de verificado, pagamento retido, estatísticas inventadas ou prazos que não existem. Uma frase só volta junto com a funcionalidade real e com a mudança correspondente no teste.

## Estrutura

```
AppShell.tsx      layout e rotas (cada página é carregada sob demanda)
App.tsx           provedores e roteador (BrowserRouter no site, HashRouter nos apps nativos)
pages/            telas
components/       componentes compartilhados
utils/            datas, moeda e busca (funções puras, testadas)
constants.tsx     catálogo e dados fictícios
test/             testes
```

## Licença

Proprietária. Todos os direitos reservados. Veja [LICENSE](LICENSE).
