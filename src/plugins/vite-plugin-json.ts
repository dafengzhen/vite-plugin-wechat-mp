import type { Plugin } from 'vite';

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { normalizePath } from 'vite';

const resolvedBy = 'vite-plugin-wechat-mp-json';

export interface JsonPluginOptions {
  /**
   * Glob pattern(s) for JSON files or directories to exclude from processing.
   */
  jsonIgnore?: string | string[];

  /**
   * Glob pattern(s) for JSON files or directories to include in processing.
   */
  jsonInclude?: string | string[];

  /**
   * Output directory for generated files.
   *
   * @default "miniprogram"
   */
  outputDir?: string;

  /**
   * Root directory for resolving files.
   *
   * @default "miniprogram"
   */
  rootDir?: string;
}

export default function jsonPlugin(options: JsonPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const outputDir = options.outputDir ?? 'miniprogram';
  const include = options.jsonInclude;
  const ignore = options.jsonIgnore;

  // Collected once per build
  const files = new Set<string>();

  return {
    buildStart() {
      files.clear();

      const patterns: string[] = [`${rootDir}/**/*.json`, 'project.config.json'];

      if (typeof include === 'string') {
        patterns.push(include);
      } else if (Array.isArray(include)) {
        patterns.push(...include);
      }

      const matches = globSync(patterns, { ignore });
      for (const f of matches) {
        files.add(f);
      }
    },
    async generateBundle() {
      const all = [...files];
      if (all.length === 0) {
        return;
      }

      await Promise.all(
        all.map(async (file) => {
          try {
            const content = await fsp.readFile(file, 'utf-8');

            // Keep JSON semantics (removes whitespace, normalizes ordering as parsed)
            const minified = JSON.stringify(JSON.parse(content));

            const isUnderRoot = normalizePath(file).startsWith(normalizePath(rootDir) + '/');
            const relative = isUnderRoot ? path.posix.relative(rootDir, normalizePath(file)) : file;
            const finalPath = isUnderRoot
              ? normalizePath(path.posix.join(outputDir, relative))
              : relative;

            this.emitFile({ fileName: finalPath, source: minified, type: 'asset' });
          } catch (error) {
            this.warn(
              `Failed to process ${file}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );
    },
    name: resolvedBy,
  };
}
