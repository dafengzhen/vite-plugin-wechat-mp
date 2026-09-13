import type { Plugin, UserConfig } from 'vite';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { normalizePath } from 'vite';

const resolvedBy = 'vite-plugin-wechat-mp-wxjs';
const WXJS_PREFIX = 'wxjs-';

export interface WxJsPluginOptions {
  /**
   * Whether this is a TypeScript project.
   *
   * @default true
   */
  isTsProject?: boolean;

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

const md5_8 = (input: string) => crypto.createHash('md5').update(input).digest('hex').slice(0, 8);

export default function wxJsPlugin(options: WxJsPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const outputDir = options.outputDir ?? 'miniprogram';
  const isTs = options.isTsProject ?? true;
  const ext = isTs ? 'ts' : 'js';

  return {
    config(config: UserConfig) {
      const files = globSync(`${rootDir}/**/*.${ext}`);

      const input: Record<string, string> = {};
      for (const file of files) {
        const relativeNoExt = path.relative(rootDir, file).replace(new RegExp(`\\.${ext}$`), '');

        const key = `${WXJS_PREFIX}${relativeNoExt}-${md5_8(relativeNoExt)}`;
        input[key] = path.resolve(file);
      }

      const userOutput = config?.build?.rolldownOptions?.output as any;
      const assetsDir = config?.build?.assetsDir ?? `${outputDir}/assets`;
      const target = config?.build?.target ?? [
        'es2015',
        'chrome87',
        'edge88',
        'firefox78',
        'safari14',
      ];

      const pluginConfig: UserConfig = {
        build: {
          assetsDir,
          rolldownOptions: {
            input,
            output: {
              entryFileNames: (chunkInfo) => {
                const name = chunkInfo.name;

                if (name.startsWith(WXJS_PREFIX)) {
                  const relative = name.slice(WXJS_PREFIX.length).replace(/-\w{8}$/, '.js');
                  return normalizePath(path.join(outputDir, relative));
                }

                const entryFileNames = userOutput?.entryFileNames;
                if (typeof entryFileNames === 'function') {
                  return entryFileNames(chunkInfo);
                }
                if (typeof entryFileNames === 'string') {
                  return entryFileNames;
                }
                return '[name].js';
              },
              format: userOutput?.format ?? 'cjs',
            },
          },
          target,
        },
      };

      return pluginConfig;
    },
    name: resolvedBy,
    transform(code, id) {
      if (!id.endsWith(`.${ext}`)) {
        return null;
      }

      const extname = path.extname(id);
      const base = path.basename(id, extname);
      const dir = path.dirname(id);

      const sidecars = [`${base}.wxml`, `${base}.wxss`, `${base}.json`];
      const imports: string[] = [];

      for (const file of sidecars) {
        if (fs.existsSync(path.join(dir, file))) {
          imports.push(`import './${file}?raw';`);
        }
      }

      if (imports.length === 0) {
        return null;
      }

      return { code: `${imports.join('\n')}\n${code}`, map: null };
    },
  };
}
