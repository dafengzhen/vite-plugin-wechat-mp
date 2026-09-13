import type { Plugin, UserConfig } from 'vite';

import crypto from 'node:crypto';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { normalizePath } from 'vite';

const resolvedBy = 'vite-plugin-wechat-mp-wxml';
const WXML_PREFIX = 'wxml-';

export interface WxmlPluginOptions {
  /**
   * Custom function to compress HTML or Uint8Array input.
   */
  compress?: (html: string | Uint8Array) => Promise<string | Uint8Array> | string | Uint8Array;

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

const isUint8Array = (input: string | Uint8Array): input is Uint8Array =>
  Object.prototype.toString.call(input) === '[object Uint8Array]';

const decode = (input: string | Uint8Array): { text: string; wasBinary: boolean } => {
  if (isUint8Array(input)) {
    return { text: new TextDecoder('utf-8').decode(input), wasBinary: true };
  }
  return { text: input, wasBinary: false };
};

const stripScriptBlocks = (source: string, keys: Set<string>): string => {
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  return source.replace(scriptRegex, (match) => (keysHasAny(match, keys) ? '' : match));
};

const keysHasAny = (haystack: string, keys: Set<string>): boolean => {
  for (const k of keys) {
    if (haystack.includes(k)) {
      return true;
    }
  }
  return false;
};

const processSource = async (
  input: string | Uint8Array,
  fileKeys: Set<string>,
  compress?: (html: string | Uint8Array) => Promise<string | Uint8Array> | string | Uint8Array,
): Promise<string | Uint8Array> => {
  const { text, wasBinary } = decode(input);

  let processed: string | Uint8Array = stripScriptBlocks(text, fileKeys);

  if (typeof compress === 'function') {
    const maybe = wasBinary ? compress(new TextEncoder().encode(processed)) : compress(processed);
    processed = maybe instanceof Promise ? await maybe : maybe;
  }

  return processed;
};

export default function wxmlPlugin(options: WxmlPluginOptions = {}): Plugin {
  const rootDir = options.rootDir ?? 'miniprogram';
  const outputDir = options.outputDir ?? 'miniprogram';
  const compress = options.compress;

  const fileKeys = new Set<string>();

  return {
    config() {
      fileKeys.clear();

      const files = globSync(`${rootDir}/**/*.wxml`);

      const input: Record<string, string> = {};
      for (const file of files) {
        const relative = path.relative(rootDir, file).replace(/\.wxml$/, '');
        const key = `${WXML_PREFIX}${relative}-${md5_8(relative)}`;

        fileKeys.add(`${key}.js`);
        input[key] = path.resolve(file);
      }

      const pluginConfig: UserConfig = {
        build: {
          rolldownOptions: {
            input,
            plugins: [
              {
                async generateBundle(_opts, bundle) {
                  for (const [fileName, file] of Object.entries(bundle)) {
                    if (file.type === 'asset' && fileName.endsWith('.html')) {
                      const relative = path.relative(rootDir, fileName).replace(/\.html$/, '.wxml');
                      const finalPath = normalizePath(path.join(outputDir, relative));

                      const source = await processSource(file.source, fileKeys, compress);

                      this.emitFile({
                        fileName: finalPath,
                        source,
                        type: 'asset',
                      });

                      delete bundle[fileName];
                    } else if (
                      file.type === 'chunk' &&
                      fileName.endsWith('.js') &&
                      fileName.startsWith(WXML_PREFIX)
                    ) {
                      delete bundle[fileName];
                    }
                  }
                },
                name: 'vite-plugin-wechat-mp-wxml-rename',
              },
            ],
          },
        },
      };

      return pluginConfig;
    },
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith('.html')) {
        return null;
      }

      const wxmlPath = id.replace(/\.html$/, '.wxml');
      const code = await fsp.readFile(wxmlPath, 'utf-8');

      return {
        code,
        map: null,
        meta: { customData: { now: Date.now(), sourceFile: wxmlPath, type: 'wxml' } },
      };
    },
    name: resolvedBy,
    resolveId(source, importer) {
      if (!source.endsWith('.wxml')) {
        return null;
      }

      const baseDir = importer ? path.dirname(importer) : process.cwd();
      const resolvedPath = path.resolve(baseDir, source);

      return {
        external: false,
        id: resolvedPath.replace(/\.wxml$/, '.html'),
        meta: { customData: { fileName: resolvedPath, now: Date.now(), type: 'wxml' } },
        moduleSideEffects: true,
        resolvedBy,
      };
    },
  };
}
