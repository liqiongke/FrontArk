import type { LoginNavigation } from '@jl/framework';

export const isDesktop = import.meta.env?.VITE_APP_TARGET === 'desktop';

// 接收 location 便于独立验证；初始化时即可使用，不依赖 React 挂载。
export const createHashNavigation = (
  location: Pick<Location, 'hash' | 'replace'> = window.location,
): LoginNavigation => ({
  getPathname: () => location.hash.slice(1).split(/[?#]/, 1)[0] || '/',
  // 不先修改 history，否则可能吞掉 HashRouter 需要的 hashchange 事件。
  replace: (path) => location.replace(`#${path}`),
});
