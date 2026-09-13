import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig(({ mode }) => {
  const plugins = [] as PluginOption[];
  if (mode === 'production') {
    // empty
  }

  return {
    build: {
      lib: {
        entry: resolve(import.meta.dirname, 'src/vite-plugin-wechat-mp.ts'),
        fileName: '[name]',
        formats: ['es', 'cjs'],
        name: 'VitePluginMp',
      },
      rolldownOptions: {
        external: ['node:crypto', 'node:fs', 'node:path', 'tinyglobby', 'vite'],
      },
    },
    plugins,
  };
});
