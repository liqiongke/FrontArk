/** 顶部页签项 */
export interface TabItem {
  /** 路由路径，同时作为页签唯一标识 */
  key: string;
  /** 页签标题 */
  title: string;
  /**
   * 固定页签（首页）。
   * 不渲染关闭按钮，也不参与「关闭其他/左侧/右侧/全部」，保证页签栏始终有可停留的页面。
   */
  affix?: boolean;
}

/** 页签集合状态（纯数据，便于单测覆盖关闭策略） */
export interface TabState {
  tabs: TabItem[];
  /** 当前激活页签的 key，与 location.pathname 保持一致 */
  activeKey: string;
}
