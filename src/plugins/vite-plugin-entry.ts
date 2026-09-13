import type { Plugin } from 'vite';

const resolvedBy = 'vite-plugin-wechat-mp-entry';

export default function entryPlugin(): Plugin {
  return {
    config() {
      return {
        build: {
          rolldownOptions: {
            input: { [resolvedBy]: resolvedBy },
          },
        },
      };
    },
    generateBundle(_options, bundle) {
      // Remove the synthetic entry chunk
      for (const key of Object.keys(bundle)) {
        const item = bundle[key];
        if (item && item.type === 'chunk' && item.name === resolvedBy) {
          delete bundle[key];
          break;
        }
      }
    },
    load(id) {
      return id === resolvedBy ? '' : null;
    },
    name: resolvedBy,
    resolveId(id) {
      return id === resolvedBy ? id : null;
    },
  };
}
