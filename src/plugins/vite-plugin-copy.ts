import type { Plugin } from 'vite';

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { glob } from 'tinyglobby';

const resolvedBy = 'vite-plugin-wechat-mp-copy';

export interface CopyPluginOptions {
  /**
   * If true, enables verbose logging of the copy process.
   *
   * @default false
   */
  debug?: boolean;

  /**
   * Output directory relative to Vite build outDir.
   * All matched files will be copied into this directory.
   *
   * @default "miniprogram"
   */
  outputDir?: string;

  /**
   * Root directory for resolving source and destination paths.
   * This is used as the base directory for globbing `src` and resolving `dest`.
   *
   * @default "miniprogram"
   */
  rootDir?: string;

  /**
   * List of copy targets, each specifying a glob pattern `src` and a destination directory `dest`.
   */
  targets?: CopyTarget[];
}

interface CopyTarget {
  /**
   * Relative destination directory within `outputDir` where matched files should be copied.
   */
  dest: string;

  /**
   * Glob pattern relative to `rootDir` for matching source files.
   */
  src: string;
}

const isGlobChar = (ch: string) => ch === '*' || ch === '?' || ch === '[' || ch === '{';

const getStaticBase = (pattern: string): string => {
  // Return the non-glob prefix of a pattern, e.g. "assets/**/*" -> "assets"
  const normalized = pattern.replaceAll('\\', '/');
  const idx = [...normalized].findIndex(isGlobChar);
  const prefix = idx === -1 ? normalized : normalized.slice(0, idx);
  return prefix.replace(/\/$/, '').split('/')[0] ?? '';
};

const pLimit = (concurrency: number) => {
  const queue: Array<() => void> = [];
  let active = 0;

  const next = () => {
    active--;
    const run = queue.shift();
    run?.();
  };

  return async <T>(fn: () => Promise<T>): Promise<T> =>
    await new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
};

export default function copyPlugin(options: CopyPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const debug = options.debug ?? false;
  const targets = options.targets ?? [];

  if (!Array.isArray(targets)) {
    throw new Error('The "targets" option must be an array of objects with "src" and "dest".');
  }

  // Resolved in configResolved
  let outBaseDir = 'dist';
  const outSubDir = options.outputDir ?? 'miniprogram';

  return {
    apply: 'build',
    configResolved(config) {
      outBaseDir = config.build?.outDir ?? 'dist';
    },
    async generateBundle() {
      if (targets.length === 0) {
        return;
      }

      const rootDirAbs = path.resolve(rootDir);
      const outputDirAbs = path.resolve(outBaseDir, outSubDir);

      const log = (msg: string) => {
        if (debug) {
          this.info(msg);
        }
      };

      // Prevent "too many open files" on large projects
      const limit = pLimit(16);

      for (const target of targets) {
        const { dest, src } = target ?? ({} as CopyTarget);

        if (!src || !dest) {
          this.error('Each target must have both "src" and "dest" properties.');
          continue;
        }

        const srcBase = getStaticBase(src);

        let files: string[];
        try {
          files = await glob(src, { cwd: rootDirAbs, dot: true, onlyFiles: true });
        } catch (error) {
          this.error(
            `Failed to resolve glob "${src}" in "${rootDir}": ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }

        if (files.length === 0) {
          continue;
        }

        log(`Copy target: src="${src}" -> dest="${dest}" (files=${files.length})`);

        await Promise.all(
          files.map((file) =>
            limit(async () => {
              const srcPath = path.join(rootDirAbs, file);

              // Keep directory structure; if we can detect the base folder, strip it
              const relativePath =
                srcBase && file.startsWith(`${srcBase}/`) ? file.slice(srcBase.length + 1) : file;

              const destPath = path.join(outputDirAbs, dest, relativePath);

              try {
                await fsp.mkdir(path.dirname(destPath), { recursive: true });
                await fsp.copyFile(srcPath, destPath);
              } catch (error) {
                this.error(
                  `Failed to copy "${file}" -> "${path.relative(outputDirAbs, destPath)}": ${error instanceof Error ? error.message : String(error)}`,
                );
              }
            }),
          ),
        );
      }
    },
    name: resolvedBy,
  };
}
