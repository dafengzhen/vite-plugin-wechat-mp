import { defineConfig } from 'vite';

import wechatMp from '../../dist/index.js';

export default defineConfig({
  build: {
    reportCompressedSize: false,
    sourcemap: true,
  },
  plugins: [wechatMp()],
});
