import type { Plugin } from 'vite';

import postcss from 'postcss';

// Skip strings, comments and URLs before matching complete dimension tokens.
const RPX_RE =
  /("(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\/\*[\s\S]*?\*\/|\burl\((?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|[^"'()\\])*\))|(?<![\w.\-\\#\u0080-\uFFFF])([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)rpx(?![\w\-\u0080-\uFFFF])/gi;

export function rpxToVw(): Plugin {
  return {
    // Normal transforms run after vite:css (imports/PostCSS) and before vite:css-post.
    name: 'wechat-mp:rpx-to-vw',
    async transform(code, id) {
      const filename = id.split('?')[0];
      if (
        !/\.(?:css|wxss)$/.test(filename) ||
        /[?&](?:raw|url)(?:&|$)/.test(id) ||
        !/rpx/i.test(code)
      ) {
        return null;
      }
      const result = await postcss([
        {
          AtRule(rule) {
            rule.params = convert(rule.params);
          },
          Declaration(declaration) {
            declaration.value = convert(declaration.value);
          },
          postcssPlugin: 'wechat-mp:rpx-to-vw',
        },
      ]).process(code, {
        from: filename,
        map: { annotation: false, inline: false },
        to: filename,
      });
      return { code: result.css, map: result.map?.toString() };
    },
  };
}

function convert(value: string): string {
  return value.replace(RPX_RE, (match, preserved: string | undefined, number: string) =>
    preserved === undefined ? `${Number((Number(number) / 7.5).toFixed(6))}vw` : match,
  );
}
