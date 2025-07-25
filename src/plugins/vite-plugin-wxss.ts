import type { OutputOptions } from 'rollup';
import type { Plugin, UserConfig } from 'vite';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globSync } from 'tinyglobby';
import { mergeConfig, normalizePath } from 'vite';

import { generateSecureRandomId } from '../tools';

const resolvedBy = 'vite-plugin-wechat-mp-wxss';
const WXSS_PREFIX = 'wxss-';

export interface WxssPluginOptions {
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

export default function wxssPlugin(options: WxssPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const outputDir = options.outputDir ?? 'miniprogram';

  return {
    config(config: UserConfig) {
      const files = globSync(`${rootDir}/**/*.wxss`);

      const input = files.reduce(
        (acc, file) => {
          const relative = path.relative(rootDir, file).replace(/\.wxss$/, '');

          const hash = crypto.createHash('md5').update(file).digest('hex').slice(0, 8);
          const key = `${WXSS_PREFIX}${relative}-${hash}`;

          acc[key] = path.resolve(file);
          return acc;
        },
        {} as Record<string, string>,
      );

      const pluginConfig: UserConfig = {
        build: {
          rollupOptions: {
            input,
            output: {
              assetFileNames: (chunkInfo) => {
                const name = chunkInfo.names?.[0];
                if (name?.startsWith(WXSS_PREFIX)) {
                  const relative = name.substring(WXSS_PREFIX.length).replace(/-\w{8}.css$/, '.wxss');
                  return normalizePath(path.join(outputDir, relative));
                }

                const assetFileNames = (config?.build?.rollupOptions?.output as OutputOptions)?.assetFileNames;
                if (typeof assetFileNames === 'function') {
                  return assetFileNames(chunkInfo);
                } else if (typeof assetFileNames === 'string') {
                  return assetFileNames;
                } else {
                  return 'assets/[name]-[hash][extname]';
                }
              },
            },
          },
        },
      };

      return mergeConfig(config, pluginConfig);
    },
    enforce: 'pre',
    generateBundle(_, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && fileName.endsWith('.js') && fileName.startsWith(WXSS_PREFIX)) {
          delete bundle[fileName];
        } else if (file.type === 'asset' && fileName.endsWith('.wxss') && typeof file.source === 'string') {
          const source = file.source.replace(/\.__wxss_[A-Za-z0-9]{8}__\s*\{\s*color:\s*#fff;?\s*}/gs, '');
          bundle[fileName] = {
            ...file,
            source,
          };
        }
      }
    },
    async load(id) {
      if (!id.endsWith('.css')) {
        return null;
      }

      const wxssPath = id.replace(/\.css$/, '.wxss');
      const code = await fs.promises.readFile(wxssPath, 'utf-8');

      return {
        code,
        map: null,
        meta: {
          customData: {
            now: Date.now(),
            sourceFile: wxssPath,
            type: 'wxss',
          },
        },
      };
    },
    name: resolvedBy,
    resolveId(source, importer) {
      if (!source.endsWith('.wxss')) {
        return null;
      }

      const baseDir = importer ? path.dirname(importer) : process.cwd();
      const resolvedPath = path.resolve(baseDir, source);

      return {
        external: false,
        id: resolvedPath.replace(/\.wxss$/, '.css'),
        meta: {
          customData: {
            fileName: resolvedPath,
            now: Date.now(),
            type: 'wxss',
          },
        },
        moduleSideEffects: true,
        resolvedBy,
      };
    },
    transform(code: string, id: string) {
      if (id.endsWith('.css') && code) {
        const newCode = code + `.__wxss_${generateSecureRandomId()}__ {color:#fff}`;
        return {
          code: newCode,
        };
      }

      return null;
    },
  };
}
