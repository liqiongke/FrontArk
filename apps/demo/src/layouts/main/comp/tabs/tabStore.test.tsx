import { describe, expect, it } from 'vitest';
import type { TabState } from './interface';
import {
  closeAll,
  closeLeft,
  closeOthers,
  closeRight,
  closeTab,
  createTabState,
  hasClosableLeft,
  hasClosableOthers,
  hasClosableRight,
  hasClosableTabs,
  openTab,
} from './tabStore';

/** 构造：固定首页 + 三个业务页签，激活项为最后一个 */
const build = (): TabState => {
  let state = createTabState();
  state = openTab(state, { key: '/base/table', title: '表格' });
  state = openTab(state, { key: '/base/form', title: '表单' });
  state = openTab(state, { key: '/base/tab', title: '标签页' });
  return state;
};

const keys = (state: TabState) => state.tabs.map((tab) => tab.key);
const titleOf = (state: TabState, key: string) =>
  state.tabs.find((tab) => tab.key === key)?.title;

describe('页签状态', () => {
  it('初始只含固定首页', () => {
    const state = createTabState();
    expect(keys(state)).toEqual(['/']);
    expect(state.activeKey).toBe('/');
    expect(state.tabs[0].affix).toBe(true);
  });

  it('打开未登记的路径时追加到末尾并激活', () => {
    const state = openTab(createTabState(), { key: '/base/table', title: '表格' });
    expect(keys(state)).toEqual(['/', '/base/table']);
    expect(state.activeKey).toBe('/base/table');
  });

  it('重复打开只激活并刷新标题，状态未变化时保持引用', () => {
    const state = build();
    const activated = openTab(state, { key: '/base/table', title: '表格' });
    expect(keys(activated)).toHaveLength(4);
    expect(activated.activeKey).toBe('/base/table');

    const renamed = openTab(activated, { key: '/base/table', title: '数据表格' });
    expect(titleOf(renamed, '/base/table')).toBe('数据表格');

    // 标题与激活项都未变化：返回原状态，避免无谓渲染
    expect(openTab(renamed, { key: '/base/table', title: '数据表格' })).toBe(renamed);
  });
});

describe('关闭页签', () => {
  it('关闭激活页签时优先激活右邻居', () => {
    const state = openTab(build(), { key: '/base/table', title: '表格' });
    const closed = closeTab(state, '/base/table');
    expect(keys(closed)).toEqual(['/', '/base/form', '/base/tab']);
    expect(closed.activeKey).toBe('/base/form');
  });

  it('关闭末尾页签时回退到左邻居', () => {
    const state = build();
    const closed = closeTab(state, '/base/tab');
    expect(keys(closed)).toEqual(['/', '/base/table', '/base/form']);
    expect(closed.activeKey).toBe('/base/form');
  });

  it('关闭非激活页签不改变当前激活项', () => {
    const state = build();
    const closed = closeTab(state, '/base/table');
    expect(keys(closed)).toEqual(['/', '/base/form', '/base/tab']);
    expect(closed.activeKey).toBe('/base/tab');
  });

  it('固定页签不可关闭', () => {
    const state = build();
    expect(closeTab(state, '/')).toBe(state);
    expect(closeTab(state, '/not-opened')).toBe(state);
  });

  it('关闭其他保留固定页签与目标页签并激活目标', () => {
    const state = closeOthers(build(), '/base/table');
    expect(keys(state)).toEqual(['/', '/base/table']);
    expect(state.activeKey).toBe('/base/table');
  });

  it('关闭左侧时固定页签保留，激活项被关闭则回退到目标页签', () => {
    const state = closeLeft(build(), '/base/tab');
    expect(keys(state)).toEqual(['/', '/base/tab']);
    expect(state.activeKey).toBe('/base/tab');

    // 激活项在目标页签右侧：不应被左侧关闭影响
    const keepActive = closeLeft(openTab(build(), { key: '/base/form', title: '表单' }), '/base/table');
    expect(keepActive.activeKey).toBe('/base/form');
  });

  it('关闭右侧时固定页签保留，激活项被关闭则回退到目标页签', () => {
    const state = closeRight(build(), '/base/table');
    expect(keys(state)).toEqual(['/', '/base/table']);
    expect(state.activeKey).toBe('/base/table');
  });

  it('关闭全部只保留固定页签', () => {
    const state = closeAll(build());
    expect(keys(state)).toEqual(['/']);
    expect(state.activeKey).toBe('/');
  });

  it('无可关闭页签时返回原状态', () => {
    const state = createTabState();
    expect(closeOthers(state, '/')).toBe(state);
    expect(closeLeft(state, '/')).toBe(state);
    expect(closeRight(state, '/')).toBe(state);
    expect(closeAll(state)).toBe(state);
  });
});

describe('菜单可用性判定', () => {
  it('按左右邻域判断是否存在可关闭页签', () => {
    const state = build();
    expect(hasClosableLeft(state.tabs, '/')).toBe(false);
    expect(hasClosableLeft(state.tabs, '/base/table')).toBe(false);
    expect(hasClosableLeft(state.tabs, '/base/form')).toBe(true);
    expect(hasClosableRight(state.tabs, '/base/tab')).toBe(false);
    expect(hasClosableRight(state.tabs, '/base/form')).toBe(true);
    expect(hasClosableLeft(state.tabs, '/not-opened')).toBe(false);
    expect(hasClosableRight(state.tabs, '/not-opened')).toBe(false);
  });

  it('判断其他页签与整体是否存在可关闭项', () => {
    const state = build();
    expect(hasClosableOthers(state.tabs, '/base/table')).toBe(true);
    expect(hasClosableTabs(state.tabs)).toBe(true);

    const onlyHome = createTabState();
    expect(hasClosableOthers(onlyHome.tabs, '/')).toBe(false);
    expect(hasClosableTabs(onlyHome.tabs)).toBe(false);
  });
});
