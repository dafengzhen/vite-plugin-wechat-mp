import type { Plugin, UserConfig } from 'vite';

import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { normalizePath } from 'vite';

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

const md5_8 = (input: string) => crypto.createHash('md5').update(input).digest('hex').slice(0, 8);

const EMPTY_MARK_RE = /\.__wxss_[A-Za-z0-9]{8}__\s*\{\s*color:\s*#fff;?\s*}/gs;

export default function wxssPlugin(options: WxssPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const outputDir = options.outputDir ?? 'miniprogram';

  return {
    config(config: UserConfig) {
      const files = globSync(`${rootDir}/**/*.wxss`);

      const input: Record<string, string> = {};
      for (const file of files) {
        const relative = path.relative(rootDir, file).replace(/\.wxss$/, '');
        const key = `${WXSS_PREFIX}${relative}-${md5_8(relative)}`;
        input[key] = path.resolve(file);
      }

      const userOutput = config?.build?.rolldownOptions?.output as any;

      const pluginConfig: UserConfig = {
        build: {
          rolldownOptions: {
            input,
            output: {
              assetFileNames: (assetInfo) => {
                const name = assetInfo.names?.[0];
                if (name?.startsWith(WXSS_PREFIX)) {
                  const relative = name.slice(WXSS_PREFIX.length).replace(/-\w{8}\.css$/, '.wxss');
                  return normalizePath(path.join(outputDir, relative));
                }

                const assetFileNames = userOutput?.assetFileNames;
                if (typeof assetFileNames === 'function') {
                  return assetFileNames(assetInfo);
                }
                if (typeof assetFileNames === 'string') {
                  return assetFileNames;
                }
                return 'assets/[name]-[hash][extname]';
              },
            },
          },
        },
      };

      return pluginConfig;
    },
    enforce: 'pre',
    generateBundle(_opts, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && fileName.endsWith('.js') && fileName.startsWith(WXSS_PREFIX)) {
          delete bundle[fileName];
          continue;
        }

        if (
          file.type === 'asset' &&
          fileName.endsWith('.wxss') &&
          typeof file.source === 'string'
        ) {
          file.source = file.source.replace(EMPTY_MARK_RE, '');
        }
      }
    },
    async load(id) {
      if (!id.endsWith('.css')) {
        return null;
      }

      const wxssPath = id.replace(/\.css$/, '.wxss');
      const code = await fsp.readFile(wxssPath, 'utf-8');

      return {
        code,
        map: null,
        meta: { customData: { now: Date.now(), sourceFile: wxssPath, type: 'wxss' } },
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
        meta: { customData: { fileName: resolvedPath, now: Date.now(), type: 'wxss' } },
        moduleSideEffects: true,
        resolvedBy,
      };
    },
    transform(code: string, id: string) {
      if (!id.endsWith('.css') || !code) {
        return null;
      }

      // Add a unique marker to prevent WXSS content from being tree-shaken / merged incorrectly.
      // Removed later in generateBundle.
      const mark = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
      return { code: `${code}\n.__wxss_${mark}__ {color:#fff}` };
    },
  };
}
