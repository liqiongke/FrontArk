import assert from 'node:assert/strict';
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
