import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { normalizePath } from 'vite';

import type { WechatMpOptions } from './options';

export const SCRIPT_RE = /\.[cm]?[jt]s$/;
export const DECLARATION_RE = /\.d\.[cm]?ts$/;

export async function collectFiles(
  directory: string,
  watch: (file: string) => void,
): Promise<string[]> {
  if (!(await stat(directory)).isDirectory()) {
    throw new Error(`[wechat-mp] Source is not a directory: ${directory}`);
  }
  const files: string[] = [];
  async function visit(current: string) {
    watch(current);
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (entry.isFile()) {
        watch(filename);
        files.push(filename);
      }
    }
  }
  await visit(directory);
  return files;
}

export async function fileExists(filename: string): Promise<boolean> {
  try {
    return (await stat(filename)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

export function resolveDirectories(root: string, outDir: string, options: WechatMpOptions) {
  const source = path.resolve(root, options.srcDir ?? 'miniprogram');
  const output = path.resolve(root, outDir);
  const destination = options.outDir ?? 'miniprogram';
  if (path.isAbsolute(destination) || !isInside(output, path.resolve(output, destination))) {
    throw new Error('[wechat-mp] outDir must be a relative path inside build.outDir.');
  }
  // Vite may empty the output before writing. It must not contain the sources,
  // and generated files must not be scanned as sources during watched builds.
  if (isInside(source, output) || isInside(output, source)) {
    throw new Error('[wechat-mp] Source and build.outDir must not overlap.');
  }
  return { destination: path.posix.normalize(normalizePath(destination)), output, source };
}
