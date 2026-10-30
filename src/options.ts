import type { PluginOption } from 'vite';

export interface WechatMpOptions {
  /** Mini program directory inside build.outDir. Use '.' for a flat output. @default 'miniprogram' */
  outDir?: string;
  /** Plugins for internal Vite builds. Outer plugins are not run recursively. */
  plugins?: PluginOption[];
  /** Developer Tools project config, relative to Vite root; emitted inside outDir with miniprogramRoot './'. Set false to omit it. @default 'project.config.json' */
  projectConfig?: false | string;
  /** Copy both project configs only when the destination is missing. Disables build.emptyOutDir. @default false */
  projectConfigCopyOnce?: boolean;
  /** Copy private Developer Tools config verbatim into outDir. true uses 'project.private.config.json'; a path is relative to Vite root. @default false */
  projectPrivateConfig?: boolean | string;
  /** Convert WXSS/CSS rpx units to vw (750rpx = 100vw). @default false */
  rpxToVw?: boolean;
  /** Source directory, relative to Vite root. @default 'miniprogram' */
  srcDir?: string;
  /** Optional WXML transform. WXML is otherwise copied verbatim. */
  transformWxml?: (source: string, filename: string) => Promise<string> | string;
}
