import { type TableColumn } from '../interface';

/**
 * 列偏好：顺序 + 是否展示。
 *
 * 状态只记「用户改过什么」，不记「配置本来是什么」：
 * - order 为 undefined 表示沿用配置里的列顺序；
 * - hiddenKeys 只记被隐藏的列，配置新增的列自动可见。
 * 这样业务侧改列配置（加列/删列/改标题）后，用户偏好不会把新列藏起来。
 */

/** 按用户顺序重排：未出现在 order 中的列（配置新增）追加到末尾 */
export const orderColumns = (columns: TableColumn[], order?: string[]): TableColumn[] => {
  if (!order || order.length === 0) {
    return columns;
  }
  const byKey = new Map(columns.map((col) => [col.key, col]));
  const ordered: TableColumn[] = [];
  order.forEach((key) => {
    const col = byKey.get(key);
    if (col) {
      ordered.push(col);
      byKey.delete(key);
    }
  });
  // order 里已失效的 key 被忽略，配置新增的列按配置顺序补在末尾
  columns.forEach((col) => {
    if (byKey.has(col.key)) {
      ordered.push(col);
    }
  });
  return ordered;
};

/** 取当前完整列顺序（供上级把「顺序」从 undefined 落成具体序列） */
export const buildColumnOrder = (columns: TableColumn[], order?: string[]): string[] =>
  orderColumns(columns, order).map((col) => col.key);

/** 过滤出展示中的列 */
export const filterVisibleColumns = (
  columns: TableColumn[],
  hiddenKeys: string[],
): TableColumn[] => {
  if (hiddenKeys.length === 0) {
    return columns;
  }
  return columns.filter((col) => !hiddenKeys.includes(col.key));
};

/**
 * 拖拽换位：把 fromKey 移到 toKey 所在的位置（目标列顺势后移/前移）。
 *
 * 与目标已相邻时直接返回原数组——拖拽期间会在同一个目标上连续触发多次（dragover），
 * 若不判相邻，一次停留就会在两个位置间来回跳。
 */
export const moveColumn = (order: string[], fromKey: string, toKey: string): string[] => {
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) {
    return order;
  }
  // 向下拖且已在目标上方相邻、向上拖且已在目标下方相邻：都无需再动
  if ((from < to && from === to - 1) || (from > to && from === to + 1)) {
    return order;
  }
  const next = order.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};
