import type { Plugin } from 'vite';

const resolvedBy = 'vite-plugin-wechat-mp-tovw';

const rpxNumber = /(-?\d*\.?\d+)rpx\b/g;

const rpxToVw = (css: string, designWidth: number): string => {
  // Convert every "<number>rpx" occurrence. This is intentionally simple and fast.
  return css.replace(rpxNumber, (_m, value: string) => {
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) {
      return _m;
    }

    const vw = (number / designWidth) * 100;
    return `${vw.toFixed(3)}vw`;
  });
};

export interface TovwPluginOptions {
  /**
   * The width of the design draft in pixels.
   *
   * @default 750
   */
  designWidth?: number;

  /**
   * Whether to enable automatic conversion from `rpx` to `vw`.
   *
   * @default false
   */
  rpxToVw?: boolean;
}

export default function vitePluginToVw(options: TovwPluginOptions = {}): Plugin {
  const enable = options.rpxToVw ?? false;
  const designWidth = options.designWidth ?? 750;

  if (designWidth <= 0) {
    throw new Error('[vite-plugin-wechat-mp-tovw] "designWidth" must be > 0.');
  }

  return {
    name: resolvedBy,
    transform(code, id) {
      if (!enable || !id.endsWith('.css')) {
        return null;
      }
      if (!code.includes('rpx')) {
        return null;
      }

      return { code: rpxToVw(code, designWidth), map: null };
    },
  };
}
