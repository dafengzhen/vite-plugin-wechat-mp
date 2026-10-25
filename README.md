# vite-plugin-wechat-mp

使用 [Vite build API](https://vite.dev/guide/api-javascript#build) 构建原生微信小程序。要求 Vite 8，Node.js 20.19+ 或 22.12+。

## 安装和使用

```bash
npm install -D vite@^8 vite-plugin-wechat-mp
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

## 构建行为

- 自动扫描源目录；JS、TS、MJS、CJS、MTS 和 CTS 可以混用，输出保留相对路径，扩展名统一为 `.js`。声明文件不参与构建。
- 脚本通过 `vite.build()` 的多入口 library 构建输出 CommonJS，保留入口导出，打包 npm 依赖，并将公共代码输出到 `chunks/`。动态 import 转为 CommonJS 加载，不注入浏览器预加载代码。
- WXSS 通过独立的 Vite 多入口样式构建处理，内联 `@import`，重写 `url()` 资源路径，并输出到对应的 `.wxss`。保留 `rpx`，空文件和内容相同的页面样式也会分别输出。以 `/` 开头的样式引用从小程序源目录解析。
- WXML 默认逐字复制，不经过 HTML 解析或压缩；WXS 和静态资源按原目录结构复制。JSON 校验后压缩，格式错误会使构建失败。
- JS 导入的图片等资源默认单独输出，并返回以 `/assets/` 开头的小程序路径；WXSS 中的资源使用相对路径。源目录中的原始资源也会保留，以供 WXML 和 JSON 按路径引用。
- 若存在 `project.config.json`，会复制到输出根目录，并更新 `miniprogramRoot`、移除 `srcMiniprogramRoot`。默认不复制 `project.private.config.json`。
- 所有产物通过外层构建的 `emitFile` 输出，遵循 `build.write` 和 `build.outDir`。watch 模式每次重新扫描入口，构建成功后清理上次生成但本次已不存在的文件。

源目录中的隐藏文件、`node_modules` 和符号链接不参与扫描。源目录与 `build.outDir` 不能重叠。

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

| 选项            | 类型                                                              | 默认值                  | 说明                                                                                            |
| --------------- | ----------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `srcDir`        | `string`                                                          | `'miniprogram'`         | 相对于 Vite root 的小程序源目录，也可以使用绝对路径                                             |
| `outDir`        | `string`                                                          | `'miniprogram'`         | 相对于 `build.outDir` 的小程序输出子目录；设为 `'.'` 可直接输出到构建目录                       |
| `projectConfig` | `string \| false`                                                 | `'project.config.json'` | 相对于 Vite root 的开发者工具配置；默认文件缺失时跳过，显式指定的文件必须存在，`false` 禁用复制 |
| `transformWxml` | `(source: string, filename: string) => string \| Promise<string>` | —                       | 自定义 WXML 转换，filename 是绝对路径                                                           |
| `plugins`       | `PluginOption[]`                                                  | `[]`                    | 传入内部脚本与样式构建的额外 Vite 插件                                                          |

内部构建继承外层的 `resolve`、`define`、`mode`、环境变量目录、`css`、`json`、`oxc`，以及 `build.target`、`minify`、`cssMinify`、`cssTarget`、`sourcemap`。内部构建固定使用 `configFile: false`、`write: false` 和 `watch: null`，不会重复加载项目配置或启动嵌套 watcher。

外层的其他插件只处理外层构建。需要转换小程序脚本或样式的插件应放在 `wechatMp({ plugins: [...] })` 中。入口、CommonJS 输出格式和文件命名由本插件管理；不要通过外层 `build.rolldownOptions` 配置小程序入口或分包规则。

这是一次不保留兼容性的重写：旧的 `rootDir`、`outputDir`、`isTsProject`、`compress`、`jsonInclude`、`jsonIgnore`、`targets`、`rpxToVw`、`designWidth` 和 `debug` 选项已移除。源文件扫描和静态资源复制自动完成；WXML 自定义处理改用 `transformWxml`。

## 开发

```bash
npm install
npm test                    # 类型检查、插件构建和集成测试
npm run lint                # 检查并修复代码风格
npm run fmt                 # 格式化

npm run build               # 先生成示例引用的本地插件包
cd examples/miniprogram
npm install                 # 安装示例的 Vite 和微信类型声明
npm run build
```

示例配置直接引用仓库内 `dist/` 中的插件包。也可以在仓库根目录运行 `npm run build:example`，同时检查插件包构建和示例构建。

## License

[MIT](LICENSE)
