// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// FileProvider: o Android só entrega URIs de pastas listadas em file_paths.xml. A WebView do Capacitor
// grava as fotos da câmera em getExternalFilesDir(DIRECTORY_PICTURES), que é a pasta de arquivos do próprio
// app. Uma raiz de armazenamento externo ("path=\".\"") deixaria todo o armazenamento compartilhado acessível.
const FILE_PATHS = join(process.cwd(), 'android', 'app', 'src', 'main', 'res', 'xml', 'file_paths.xml');
const xml = readFileSync(FILE_PATHS, 'utf8');

/** Opening tags of one kind of root, e.g. every <external-path ...>. */
const elements = (tag: string): string[] => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*>`, 'g'))].map(match => match[0]);

/** The path attribute of an element, or undefined when it has none. */
const pathOf = (element: string): string | undefined => /\spath="([^"]*)"/.exec(element)?.[1];

/** A root that exposes the whole folder it names: missing, ".", "./", "/" or empty. */
const isWholeRoot = (path: string | undefined): boolean => path === undefined || ['', '.', './', '/'].includes(path.trim());

describe('FileProvider: caminhos de arquivo do Android', () => {
  it('external-path não aponta para a raiz do armazenamento externo', () => {
    const roots = elements('external-path').filter(element => isWholeRoot(pathOf(element)));
    expect(roots, 'external-path com raiz inteira').toEqual([]);
  });

  it('a pasta de fotos da câmera (Pictures do armazenamento de arquivos do app) está coberta', () => {
    expect(elements('external-files-path').map(pathOf)).toContain('Pictures/');
  });

  it('nenhuma entrada de caminho externo expõe a raiz inteira', () => {
    const external = ['external-path', 'external-files-path', 'external-cache-path', 'external-media-path'].flatMap(elements);
    expect(external.filter(element => isWholeRoot(pathOf(element)))).toEqual([]);
  });
});
