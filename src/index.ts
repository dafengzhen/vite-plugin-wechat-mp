import type { Plugin, ResolvedConfig } from 'vite';

import { rm } from 'node:fs/promises';
import path from 'node:path';

import type { WechatMpOptions } from './options';

import { buildMiniProgram } from './build';
import { fileExists, isInside, resolveDirectories } from './files';

export type { WechatMpOptions } from './options';

const ENTRY = '\0vite-plugin-wechat-mp:entry';
const PROJECT_CONFIG_FILES = new Set(['project.config.json', 'project.private.config.json']);

export default function wechatMp(options: WechatMpOptions = {}): Plugin {
  let config: ResolvedConfig;
  let emitted = new Set<string>();
  let outputDirectories: string[];
  let projectConfigFiles: Set<string>;
  const previous = new Map<string, Set<string>>();

  async function shouldCopyProjectConfig(filename: string): Promise<boolean> {
    if (!options.projectConfigCopyOnce || !config.build.write) {
      return true;
    }
    for (const directory of outputDirectories) {
      if (!(await fileExists(path.join(directory, filename)))) {
        return true;
      }
    }
    return false;
  }

  return {
    apply: 'build',
    async buildStart() {
      const result = await buildMiniProgram(
        config,
        options,
        (file) => this.addWatchFile(file),
        shouldCopyProjectConfig,
      );
      emitted = new Set(result.keys());
      for (const [fileName, source] of result) {
        this.emitFile({ fileName, source, type: 'asset' });
      }
    },
    config() {
      return {
        build: {
          ...(options.projectConfigCopyOnce ? { emptyOutDir: false } : {}),
          modulePreload: false,
          // The outer build only writes assets produced by the inner builds.
          rolldownOptions: { input: ENTRY },
        },
        publicDir: false,
      };
    },
    configResolved(resolved) {
      config = resolved;
      // Existing configs belong to Developer Tools after their initial copy.
      if (options.projectConfigCopyOnce) {
        config.build.emptyOutDir = false;
        config.environments.client.build.emptyOutDir = false;
      }
      const { destination } = resolveDirectories(config.root, config.build.outDir, options);
      projectConfigFiles = new Set(
        [...PROJECT_CONFIG_FILES].map((filename) => path.posix.join(destination, filename)),
      );
      const outputs = config.build.rolldownOptions.output;
      outputDirectories = [
        ...new Set(
          (Array.isArray(outputs) ? outputs : [outputs]).map((output) =>
            path.resolve(config.root, output?.dir ?? config.build.outDir),
          ),
        ),
      ];
      for (const output of Array.isArray(outputs) ? outputs : [outputs]) {
        if (output?.dir) {
          resolveDirectories(config.root, output.dir, options);
        }
      }
      if (config.build.lib || config.build.ssr) {
        throw new Error('[wechat-mp] Library and SSR builds are not supported.');
      }
    },
    async generateBundle(output, bundle, isWrite) {
      const directory = path.resolve(config.root, output.dir ?? config.build.outDir);
      for (const [fileName, file] of Object.entries(bundle)) {
        if (file.type === 'chunk' && file.facadeModuleId === ENTRY) {
          delete bundle[fileName];
          delete bundle[`${fileName}.map`];
        }
        if (
          options.projectConfigCopyOnce &&
          isWrite &&
          projectConfigFiles.has(fileName) &&
          (await fileExists(path.join(directory, fileName)))
        ) {
          delete bundle[fileName];
        }
      }
    },
    load(id) {
      return id === ENTRY ? 'export {};' : null;
    },
    name: 'vite-plugin-wechat-mp',
    resolveId(id) {
      return id === ENTRY ? ENTRY : null;
    },
    async writeBundle(output) {
      const directory = path.resolve(config.root, output.dir ?? config.build.outDir);
      for (const filename of previous.get(directory) ?? []) {
        const target = path.resolve(directory, filename);
        if (
          !emitted.has(filename) &&
          !(options.projectConfigCopyOnce && projectConfigFiles.has(filename)) &&
          isInside(directory, target)
        ) {
          await rm(target, { force: true });
        }
      }
      previous.set(directory, emitted);
    },
  };
}
