import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHashNavigation, isDesktop } from '../src/init/platform.ts';

for (const [hash, pathname] of [
  ['', '/'],
  ['#', '/'],
  ['#/', '/'],
  ['#/login', '/login'],
  ['#/login?redirect=%2Fbase%2Fform', '/login'],
  ['#/base/form?name=a#field', '/base/form'],
]) {
  test(`Hash 导航正确解析 ${JSON.stringify(hash)}`, () => {
    const navigation = createHashNavigation({ hash, replace() {} });
    assert.equal(navigation.getPathname(), pathname);
  });
}

test('跳转只替换 hash，不依赖 history，保留 hashchange 触发条件', () => {
  const targets = [];
  const location = {
    hash: '#/base/table',
    replace(target) {
      targets.push(target);
      this.hash = target;
    },
  };
  const navigation = createHashNavigation(location);
  navigation.replace('/login');
  assert.deepEqual(targets, ['#/login']);
  assert.equal(navigation.getPathname(), '/login');
});

test('没有桌面构建标识时默认不启用桌面模式', () => {
  assert.equal(isDesktop, false);
});

test('主窗口隐藏系统标题栏，同时保留缩放能力', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const mainWindow = config.app.windows.find((window) => window.label === 'main');
  assert.equal(mainWindow.decorations, false);
  assert.equal(mainWindow.resizable, true);
  assert.equal(config.app.withGlobalTauri, false);
  assert.ok(config.app.security.capabilities.includes('default'));
});

test('只为主窗口授权关闭、窗口控制和无边框拖动所需的能力', () => {
  const capability = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/default.json', import.meta.url), 'utf8'));
  assert.deepEqual(capability.windows, ['main']);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(capability.permissions, [
    'core:default',
    'core:window:allow-close',
    'core:window:allow-minimize',
    'core:window:allow-toggle-maximize',
    'core:window:allow-start-dragging',
  ]);
});
