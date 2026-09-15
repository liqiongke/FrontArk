import path from 'path';

// 框架源码根目录
const srcDir = path.resolve(__dirname, 'src');

/**
 * 框架路径别名配置
 * 供 framework 与各应用的 vite.config 共享使用，
 * 需与各 tsconfig 中的 paths 映射保持一致。
 */
export function getFrameworkAliases() {
  return {
    '@': srcDir,
    '@view': path.resolve(srcDir, 'comp/view'),
    '@ctrl': path.resolve(srcDir, 'comp/control'),
    '@store': path.resolve(srcDir, 'stores/store'),
    '@data': path.resolve(srcDir, 'data'),
    '@handler': path.resolve(srcDir, 'handler'),
    '@utils': path.resolve(srcDir, 'utils'),
  };
}
