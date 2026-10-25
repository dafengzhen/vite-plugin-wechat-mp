import type { InlineConfig, Plugin, ResolvedConfig } from 'vite';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build, normalizePath } from 'vite';

import type { WechatMpOptions } from './options';

import { collectFiles, DECLARATION_RE, resolveDirectories, SCRIPT_RE } from './files';
import { rpxToVw } from './plugins/rpx-to-vw';

type BuildFiles = Map<string, string | Uint8Array>;
const STYLE_SUFFIX = '.wechat-mp.css';

export async function buildMiniProgram(
  config: ResolvedConfig,
  options: WechatMpOptions,
  watch: (file: string) => void,
  shouldCopyProjectConfig: (filename: string) => Promise<boolean> = async () => true,
): Promise<BuildFiles> {
  const { destination, source } = resolveDirectories(config.root, config.build.outDir, options);
  const files = await collectFiles(source, watch);
  const output: BuildFiles = new Map();
  const scriptEntries: Record<string, string> = Object.create(null);
  const styleEntries: Record<string, string> = Object.create(null);
  const relative = (filename: string) => normalizePath(path.relative(source, filename));
  const emit = (filename: string, content: string | Uint8Array) => {
    const name = path.posix.join(destination, filename);
    const previous = output.get(name);
    if (previous !== undefined && !Buffer.from(previous).equals(Buffer.from(content))) {
      throw new Error(`[wechat-mp] Conflicting output: ${name}`);
    }
    output.set(name, content);
  };

  for (const filename of files) {
    const name = relative(filename);
    if (DECLARATION_RE.test(name) || name.endsWith('.tsbuildinfo')) {
      continue;
    }
    if (SCRIPT_RE.test(name)) {
      const entry = name.replace(SCRIPT_RE, '');
      if (scriptEntries[entry]) {
        throw new Error(`[wechat-mp] Multiple scripts produce ${entry}.js`);
      }
      scriptEntries[entry] = filename;
    } else if (name.endsWith('.wxss')) {
      styleEntries[name.slice(0, -5)] = `${filename}${STYLE_SUFFIX}`;
    } else {
      let content: string | Uint8Array = await readFile(filename);
      if (name.endsWith('.json')) {
        content = JSON.stringify(parseJson(content.toString(), filename));
      } else if (name.endsWith('.wxml') && options.transformWxml) {
        content = await options.transformWxml(content.toString(), filename);
      }
      emit(name, content);
    }
  }

  const common: InlineConfig = {
    base: './',
    build: {
      assetsInlineLimit: 0,
      copyPublicDir: false,
      cssMinify: config.build.cssMinify,
      cssTarget: config.build.cssTarget,
      emptyOutDir: false,
      minify: config.build.minify,
      modulePreload: false,
      reportCompressedSize: false,
      sourcemap: config.build.sourcemap,
      target: config.build.target,
      watch: null,
      write: false,
    },
    configFile: false,
    css: {
      ...config.css,
      postcss:
        typeof config.css.postcss === 'string'
          ? path.resolve(config.root, config.css.postcss)
          : config.css.postcss,
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(config.isProduction ? 'production' : 'development'),
      ...config.define,
    },
    envDir: config.envDir,
    envPrefix: config.envPrefix,
    experimental: {
      renderBuiltUrl(filename, context) {
        return context.hostType === 'js' ? '/' + filename : { relative: true };
      },
    },
    json: config.json,
    logLevel: 'warn',
    mode: config.mode,
    oxc: config.oxc,
    publicDir: false,
    resolve: config.resolve,
    root: source,
  };

  const trackDependencies = (): Plugin => ({
    name: 'wechat-mp:dependencies',
    transform(_code, id) {
      const filename = id.split('?')[0];
      if (filename && path.isAbsolute(filename)) {
        watch(filename.endsWith(STYLE_SUFFIX) ? filename.slice(0, -STYLE_SUFFIX.length) : filename);
      }
      return null;
    },
  });

  async function compile(input: Record<string, string>, styles: boolean) {
    if (Object.keys(input).length === 0) {
      return;
    }
    const result = await build({
      ...common,
      build: {
        ...common.build,
        cssCodeSplit: true,
        // Library mode avoids browser preload helpers in the mini program VM.
        lib: styles ? false : { entry: input, formats: ['cjs'] },
        rolldownOptions: {
          input,
          output: {
            assetFileNames(asset) {
              const name = asset.names[0];
              return styles && name?.endsWith('.css') ? name : 'assets/[name]-[hash][extname]';
            },
            chunkFileNames: 'chunks/[name]-[hash].js',
            dynamicImportInCjs: false,
            entryFileNames: '[name].js',
            exports: 'auto',
            format: 'cjs',
          },
          preserveEntrySignatures: 'strict',
        },
      },
      plugins: [
        ...(options.plugins ?? []),
        options.rpxToVw && rpxToVw(),
        {
          enforce: 'pre',
          name: 'wechat-mp:script-assets',
          async resolveId(id, importer) {
            if (styles || /[?&](?:raw|inline|no-inline)(?:&|$)/.test(id)) {
              return null;
            }
            const filename = id.split('?')[0];
            if (!config.assetsInclude(filename) && !/[?&]url(?:&|$)/.test(id)) {
              return null;
            }
            const resolved = await this.resolve(id, importer, { skipSelf: true });
            if (!resolved || resolved.external) {
              return resolved;
            }
            return {
              ...resolved,
              id: resolved.id + (resolved.id.includes('?') ? '&' : '?') + 'no-inline',
            };
          },
        },
        {
          enforce: 'pre',
          async load(id) {
            if (!id.endsWith(STYLE_SUFFIX)) {
              return null;
            }
            const filename = id.slice(0, -STYLE_SUFFIX.length);
            this.addWatchFile(filename);
            return readFile(filename, 'utf8');
          },
          name: 'wechat-mp:wxss',
          resolveId(id) {
            return id.endsWith(STYLE_SUFFIX) ? id : null;
          },
        },
        trackDependencies(),
      ],
    });
    if ('on' in result) {
      throw new Error('[wechat-mp] Expected a single Vite build result.');
    }
    for (const file of (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)) {
      if (file.type === 'chunk') {
        if (!styles) {
          emit(file.fileName, file.code);
        }
      } else if (styles && file.names.some((name) => name.endsWith('.css'))) {
        // Vite deduplicates equal stylesheets into one asset with several names.
        for (const name of file.names.filter((name) => name.endsWith('.css'))) {
          emit(name.slice(0, -4) + '.wxss', file.source);
        }
      } else {
        emit(file.fileName, file.source);
      }
    }
  }

  await compile(scriptEntries, false);
  await compile(styleEntries, true);

  // Empty stylesheets must still exist at their native runtime paths.
  for (const name of Object.keys(styleEntries)) {
    const filename = path.posix.join(destination, `${name}.wxss`);
    if (!output.has(filename)) {
      emit(`${name}.wxss`, '');
    }
  }

  const projectConfig = options.projectConfig ?? 'project.config.json';
  if (projectConfig !== false && (await shouldCopyProjectConfig('project.config.json'))) {
    const filename = path.resolve(config.root, projectConfig);
    watch(filename);
    try {
      const project = parseJson(await readFile(filename, 'utf8'), filename);
      if (typeof project !== 'object' || project === null || Array.isArray(project)) {
        // noinspection ExceptionCaughtLocallyJS
        throw new Error(`[wechat-mp] Expected an object in ${filename}`);
      }
      project.miniprogramRoot = `${destination.replace(/\/$/, '')}/`;
      delete project.srcMiniprogramRoot;
      output.set('project.config.json', JSON.stringify(project));
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
        options.projectConfig !== undefined
      ) {
        throw error;
      }
    }
  }
  const projectPrivateConfig = options.projectPrivateConfig ?? false;
  if (
    projectPrivateConfig !== false &&
    (await shouldCopyProjectConfig('project.private.config.json'))
  ) {
    const filename = path.resolve(
      config.root,
      projectPrivateConfig === true ? 'project.private.config.json' : projectPrivateConfig,
    );
    watch(filename);
    output.set('project.private.config.json', await readFile(filename));
  }
  return output;
}

function parseJson(source: string, filename: string) {
  try {
    return JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`[wechat-mp] Invalid JSON in ${filename}`, { cause: error });
  }
}
