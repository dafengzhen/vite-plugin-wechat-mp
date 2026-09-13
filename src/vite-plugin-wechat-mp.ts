import type { Plugin } from 'vite';

import { promises as fsp } from 'node:fs';
import path from 'node:path';

import type { CopyPluginOptions } from './plugins/vite-plugin-copy';
import type { JsonPluginOptions } from './plugins/vite-plugin-json';
import type { TovwPluginOptions } from './plugins/vite-plugin-tovw';
import type { WxJsPluginOptions } from './plugins/vite-plugin-wxjs';
import type { WxmlPluginOptions } from './plugins/vite-plugin-wxml';
import type { WxssPluginOptions } from './plugins/vite-plugin-wxss';

import copyPlugin from './plugins/vite-plugin-copy';
import entryPlugin from './plugins/vite-plugin-entry';
import jsonPlugin from './plugins/vite-plugin-json';
import tovwPlugin from './plugins/vite-plugin-tovw';
import wxJsPlugin from './plugins/vite-plugin-wxjs';
import wxmlPlugin from './plugins/vite-plugin-wxml';
import wxssPlugin from './plugins/vite-plugin-wxss';

const PLUGIN_NAME = 'vite-plugin-wechat-mp';
const ROOT_CHECK_PLUGIN_NAME = `${PLUGIN_NAME}-root-check`;

export interface IOptions
  extends
    CopyPluginOptions,
    JsonPluginOptions,
    TovwPluginOptions,
    WxJsPluginOptions,
    WxmlPluginOptions,
    WxssPluginOptions {}

export default function MpPlugin(options: IOptions = {}): Plugin[] {
  const rootDir = options.rootDir ?? 'miniprogram';

  return [
    createRootCheckPlugin(rootDir),
    entryPlugin(),
    wxmlPlugin(options),
    wxssPlugin(options),
    wxJsPlugin(options),
    jsonPlugin(options),
    copyPlugin(options),
    tovwPlugin(options),
  ];
}

function createRootCheckPlugin(rootDir: string): Plugin {
  return {
    async buildStart() {
      const fullPath = path.resolve(rootDir);

      try {
        const stat = await fsp.stat(fullPath);
        if (!stat.isDirectory()) {
          this.warn(`rootDir "${rootDir}" is not a directory.`);
          return;
        }

        const files = await fsp.readdir(fullPath);
        if (files.length === 0) {
          this.warn(`rootDir "${rootDir}" is an empty directory.`);
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          this.warn(`rootDir "${rootDir}" does not exist.`);
        } else {
          this.warn(`Failed to check rootDir "${rootDir}": ${String(err)}`);
        }
      }
    },
    name: ROOT_CHECK_PLUGIN_NAME,
  };
}

(MpPlugin as any).resolvedBy = PLUGIN_NAME;
