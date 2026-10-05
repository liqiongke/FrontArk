import type { TabItem, TabState } from './interface';

/** 首页路径：作为固定页签，关闭其他页签后仍可停留 */
export const HOME_KEY = '/';

/** 固定页签定义 */
export const HOME_TAB: TabItem = { key: HOME_KEY, title: '首页', affix: true };

/** 页签初始状态：只含固定页签 */
export const createTabState = (): TabState => ({ tabs: [{ ...HOME_TAB }], activeKey: HOME_TAB.key });

const isClosable = (tab: TabItem) => !tab.affix;

const indexOfKey = (tabs: TabItem[], key: string) => tabs.findIndex((tab) => tab.key === key);

/**
 * 关闭页签后应激活的邻居：优先右邻居，其次左邻居。
 * 入参为「关闭前」的页签数组与被关闭项下标。
 */
const neighborKey = (tabs: TabItem[], index: number): string =>
  tabs[index + 1]?.key ?? tabs[index - 1]?.key ?? tabs[0]?.key ?? '';

/**
 * 打开或激活页签。
 * - 不存在：追加到末尾并激活
 * - 已存在：激活并刷新标题（菜单数据后到或页面改名时保持同步）
 */
export const openTab = (state: TabState, tab: TabItem): TabState => {
  const index = indexOfKey(state.tabs, tab.key);
  if (index < 0) {
    return { tabs: [...state.tabs, tab], activeKey: tab.key };
  }
  const existing = state.tabs[index];
  // 标题与激活态都未变化时返回原状态，避免路由/菜单数据更新触发无谓渲染
  if (existing.title === tab.title && state.activeKey === tab.key) {
    return state;
  }
  // 就地更新标题，保留既有页签的固定属性
  const tabs = state.tabs.map((item, i) => (i === index ? { ...item, title: tab.title } : item));
  return { tabs, activeKey: tab.key };
};

/** 关闭单个页签；关闭的是当前页签时激活相邻页签 */
export const closeTab = (state: TabState, key: string): TabState => {
  const index = indexOfKey(state.tabs, key);
  if (index < 0 || !isClosable(state.tabs[index])) {
    return state;
  }
  return {
    tabs: state.tabs.filter((tab) => tab.key !== key),
    activeKey: state.activeKey === key ? neighborKey(state.tabs, index) : state.activeKey,
  };
};

/** 关闭其他页签：保留目标页签与固定页签，并激活目标页签 */
export const closeOthers = (state: TabState, key: string): TabState => {
  if (indexOfKey(state.tabs, key) < 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab) => tab.affix || tab.key === key);
  if (tabs.length === state.tabs.length) {
    return state;
  }
  return { tabs, activeKey: key };
};

/** 关闭左侧页签：固定页签不受影响 */
export const closeLeft = (state: TabState, key: string): TabState => {
  const index = indexOfKey(state.tabs, key);
  if (index <= 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab, i) => i >= index || !isClosable(tab));
  if (tabs.length === state.tabs.length) {
    return state;
  }
  // 当前激活页签可能就在被关闭的一侧，此时回退到触发操作的页签
  return { tabs, activeKey: tabs.some((tab) => tab.key === state.activeKey) ? state.activeKey : key };
};

/** 关闭右侧页签：固定页签不受影响 */
export const closeRight = (state: TabState, key: string): TabState => {
  const index = indexOfKey(state.tabs, key);
  if (index < 0) {
    return state;
  }
  const tabs = state.tabs.filter((tab, i) => i <= index || !isClosable(tab));
  if (tabs.length === state.tabs.length) {
    return state;
  }
  return { tabs, activeKey: tabs.some((tab) => tab.key === state.activeKey) ? state.activeKey : key };
};

/** 关闭全部页签：只保留固定页签 */
export const closeAll = (state: TabState): TabState => {
  const tabs = state.tabs.filter((tab) => !isClosable(tab));
  if (tabs.length === state.tabs.length) {
    return state;
  }
  const activeKey = tabs.some((tab) => tab.key === state.activeKey) ? state.activeKey : (tabs[0]?.key ?? '');
  return { tabs, activeKey };
};

/** 目标页签左侧是否存在可关闭页签（供菜单禁用态使用） */
export const hasClosableLeft = (tabs: TabItem[], key: string): boolean => {
  const index = indexOfKey(tabs, key);
  return index > 0 && tabs.slice(0, index).some(isClosable);
};

/** 目标页签右侧是否存在可关闭页签 */
export const hasClosableRight = (tabs: TabItem[], key: string): boolean => {
  const index = indexOfKey(tabs, key);
  return index >= 0 && tabs.slice(index + 1).some(isClosable);
};

/** 除目标页签外是否还有可关闭页签 */
export const hasClosableOthers = (tabs: TabItem[], key: string): boolean =>
  tabs.some((tab) => tab.key !== key && isClosable(tab));

/** 是否存在可关闭页签（「关闭全部」是否可用） */
export const hasClosableTabs = (tabs: TabItem[]): boolean => tabs.some(isClosable);
