# vite-plugin-wechat-mp

## 安装和使用

```bash
npm install -D vite-plugin-wechat-mp
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import wechatMp from 'vite-plugin-wechat-mp';

export default defineConfig({
  plugins: [wechatMp()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
```

```bash
npx vite build          # 生产构建
npx vite build --watch  # 监听源文件的修改、新增和删除
```

构建后，在微信开发者工具中导入 `dist`。开发时使用 `vite build --watch`；插件仅在 build 模式运行，不提供浏览器开发服务器。

```text
输入                             输出
miniprogram/                     dist/
  app.ts                           miniprogram/
  app.json                           app.js
  app.wxss                           app.json
  pages/index/                       app.wxss
    index.ts                         pages/index/
    index.json                         index.js
    index.wxml                         index.json
    index.wxss                         index.wxml
  utils/util.js                        index.wxss
  assets/icon.png                    utils/util.js
project.config.json                  assets/icon.png
                                   project.config.json
```

## 配置

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import wechatMp from 'vite-plugin-wechat-mp';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    wechatMp({
      srcDir: 'src',
      outDir: 'mp',
      projectConfig: 'project.config.json',
      projectConfigCopyOnce: true,
      projectPrivateConfig: true,
      rpxToVw: true,
      transformWxml: async (source, filename) => source,
      plugins: [],
    }),
  ],
  build: {
    outDir: 'dist',
    target: 'es2018',
    minify: true,
  },
});
```

上例会将 `src/` 构建到 `dist/mp/`。

| 选项                    | 类型                                                              | 默认值                  | 说明                                                                                                                                                                   |
|-------------------------|-------------------------------------------------------------------|-------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `srcDir`                | `string`                                                          | `'miniprogram'`         | 相对于 Vite root 的小程序源目录，也可以使用绝对路径                                                                                                                    |
| `outDir`                | `string`                                                          | `'miniprogram'`         | 相对于 `build.outDir` 的小程序输出子目录；设为 `'.'` 可直接输出到构建目录                                                                                              |
| `projectConfig`         | `string \| false`                                                 | `'project.config.json'` | 相对于 Vite root 的开发者工具配置；默认文件缺失时跳过，显式指定的文件必须存在，`false` 禁用复制                                                                        |
| `projectConfigCopyOnce` | `boolean`                                                         | `false`                 | 两个项目配置文件仅在目标文件不存在时复制，保留开发者工具对输出配置的修改；开启后自动将 `build.emptyOutDir` 设为 `false`                                                |
| `projectPrivateConfig`  | `boolean \| string`                                               | `false`                 | 设为 `true` 时，将 Vite root 下的 `project.private.config.json` 原样复制到 `build.outDir` 根目录；也可指定相对于 Vite root 的路径。启用后文件必须存在，支持 watch 更新 |
| `rpxToVw`               | `boolean`                                                         | `false`                 | 启用内置插件，将 WXSS/CSS 中的 `rpx` 按 `750rpx = 100vw` 转为 `vw`，保留最多 6 位小数                                                                                  |
| `transformWxml`         | `(source: string, filename: string) => string \| Promise<string>` | —                       | 自定义 WXML 转换，filename 是绝对路径                                                                                                                                  |
| `plugins`               | `PluginOption[]`                                                  | `[]`                    | 传入内部脚本与样式构建的额外 Vite 插件                                                                                                                                 |

## License

[MIT](LICENSE)
