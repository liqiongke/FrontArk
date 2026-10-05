import { type CSSProperties } from 'react';
import { type TableColumn } from '../interface';

/**
 * 固定列
 *
 * 实现基于 `position: sticky` + 每列自己的偏移量，不改表格布局：
 * - 横向滚动容器是表格外层（列宽总和 > 容器宽时才真正滚动），
 *   sticky 的偏移基准因此就是滚动窗口左右边缘，左侧列取 `left`、右侧列取 `right`；
 * - 偏移量必须等于「本侧到它为止的固定列宽度之和」，所以宽度要用**实际渲染宽度**
 *   （表格 fixed 布局 + w-full 时浏览器会把余量摊给各列，声明宽度会偏小）；
 * - 固定列恒排在本侧最前/最后：列设置里拖顺序也不会把固定列拖进中间，
 *   否则它的偏移量与视觉位置会对不上。
 */

/** 按固定位置分区：左固定在前、右固定在后，同侧内保持原有相对顺序 */
export const partitionColumnsByFixed = (columns: TableColumn[]): TableColumn[] => {
  const left: TableColumn[] = [];
  const middle: TableColumn[] = [];
  const right: TableColumn[] = [];
  columns.forEach((column) => {
    if (column.fixed === 'left') {
      left.push(column);
    } else if (column.fixed === 'right') {
      right.push(column);
    } else {
      middle.push(column);
    }
  });
  // 没有固定列时原样返回，保持引用稳定（避免无谓的重渲染）
  if (left.length === 0 && right.length === 0) {
    return columns;
  }
  return [...left, ...middle, ...right];
};

/** 是否存在固定列 */
export const hasFixedColumns = (columns: TableColumn[]) =>
  columns.some((column) => column.fixed === 'left' || column.fixed === 'right');

/**
 * 计算每列固定列的偏移量(px)
 * widths 与 columns 一一对应，为各列的实际渲染宽度
 */
export const resolveFixedOffsets = (
  columns: TableColumn[],
  widths: number[],
): Record<string, number> => {
  const offsets: Record<string, number> = {};
  let left = 0;
  columns.forEach((column, index) => {
    if (column.fixed !== 'left') {
      return;
    }
    offsets[column.key] = left;
    left += widths[index] ?? 0;
  });
  let right = 0;
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const column = columns[index];
    if (column.fixed !== 'right') {
      continue;
    }
    offsets[column.key] = right;
    right += widths[index] ?? 0;
  }
  return offsets;
};

/** 固定列的定位样式；非固定列返回 undefined（不写内联样式） */
export const fixedCellStyle = (
  column: TableColumn,
  offsets: Record<string, number>,
): CSSProperties | undefined => {
  if (column.fixed !== 'left' && column.fixed !== 'right') {
    return undefined;
  }
  const offset = offsets[column.key];
  if (offset === undefined) {
    return undefined;
  }
  return column.fixed === 'left' ? { left: offset } : { right: offset };
};
