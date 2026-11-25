import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const { GITHUB_WORKSPACE: root, GITHUB_SHA: commit, GITHUB_REF_NAME: tag, GITHUB_RUN_ID: run } = process.env;
if (!root || !/^[a-f0-9]{40}$/.test(commit) || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('Execute no job de prerelease associado à tag da versão');
}

const packages = [
  ['web', 'browser', 'workeasy-web', 'WorkEasy-web.tar.gz', 'não aplicável'],
  ['linux', 'amd64', 'workeasy-linux', '.deb', 'sem assinatura de distribuição'],
  ['linux', 'x64', 'workeasy-linux', '.AppImage', 'sem assinatura de distribuição'],
  ['windows', 'x64', 'workeasy-windows', '.msi', 'sem assinatura de distribuição'],
  ['windows', 'x64', 'workeasy-windows', '.exe', 'sem assinatura de distribuição'],
  ['macos', 'arm64+x86_64', 'workeasy-macos', '.dmg', 'sem Developer ID e notarização verificados'],
];

const output = join(root, 'release-files');
await mkdir(output);
const files = [];
const version = tag.slice(1);
for (const [platform, architecture, artifact, suffix, signature] of packages) {
  const directory = join(root, 'release-input', artifact);
  const matches = (await readdir(directory, { recursive: true })).filter(file => basename(file).endsWith(suffix));
  if (matches.length !== 1) throw new Error(`Esperado um arquivo ${suffix} em ${artifact}, encontrados ${matches.length}`);
  const source = join(directory, matches[0]);
  const name = basename(source);
  const path = join(output, name);
  await copyFile(source, path);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  files.push({
    platform, architecture, version, commit, environment: 'production', supabaseProject: 'hlzdgbxygtaklqaoihlq',
    name, bytes: (await stat(path)).size, sha256: hash.digest('hex'), channel: 'GitHub prerelease', signature,
  });
}

await writeFile(join(output, 'release-manifest.json'), JSON.stringify({ tag, commit, run, files }, null, 2) + '\n');
await writeFile(join(output, 'SHA256SUMS'), files.map(file => `${file.sha256}  ${file.name}\n`).join(''));
await writeFile(join(output, 'NOTAS.md'), `# WorkEasy ${tag}

Revisão \`${commit}\`. Candidato conectado ao Supabase de produção.

Os pacotes desktop aguardam validação de instalação e uso. Windows e macOS aguardam assinatura de distribuição e o macOS também aguarda notarização. O DMG contém código arm64 e x86_64. A execução nativa em cada arquitetura requer validação própria.

O arquivo web é o bundle PWA para hospedagem. Os pacotes Android e iOS de distribuição dependem de assinatura e validação dos canais móveis.

Use o SHA-256 de \`SHA256SUMS\` para comparar o arquivo baixado. Consulte as evidências e o procedimento de atualização e recuperação no [registro da entrega](https://github.com/drguilhermecapel/Work-Easy/blob/${commit}/apps/web/docs/operacao/14-entrega-multiplataforma.md).
`);
