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
