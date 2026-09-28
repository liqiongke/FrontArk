import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('HTML 不再注入覆盖 Tailwind 的未分层 reset，基础样式由统一入口管理', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /<style\b/i);
  assert.match(css, /@import 'tailwindcss'/);
  assert.match(css, /@layer base\s*\{/);
});

for (const kind of ['modal', 'drawer']) {
  test(`${kind} 由根视图自动挂载，页面布局不再重复绘制遮罩`, () => {
    const view = readFileSync(new URL(`../src/pages/base/${kind}/view.tsx`, import.meta.url), 'utf8');
    const layout = view.match(/layout: VProps\.Flex = \{([\s\S]*?)\};/)?.[1];
    assert.ok(layout);
    assert.match(layout, /items: \[this\.toolbar\.id\]/);
    assert.doesNotMatch(layout, /this\.(?:modal|drawer)\.id/);
  });
}
