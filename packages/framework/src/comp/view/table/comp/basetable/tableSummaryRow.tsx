import { type DPath } from '@/stores/store/interface';
import { useData } from '@/stores/store/hooks/useValue';
import { get, isArray, isNumber, isString } from 'lodash';
import React, { Fragment, useMemo } from 'react';
import { cn } from '@/ui/lib/utils';
import {
  SummaryType,
  type TableColumn,
  type TableSummaryFn,
  type TableSummaryItem,
} from '../../interface';

interface TableSummaryRowProps {
  /** 框架列描述，用于把统计结果落到对应列 */
  columns: TableColumn[];
  /** 统计配置 */
  items: TableSummaryItem[];
  /** 首列文案 */
  summaryText: string;
  /** 表格数据路径（view.path ?? dataId），统计行按此路径独立订阅数据 */
  dataPath: DPath;
  /** 指向 tfoot 本身：覆盖式滚动条据此把轨道下端内缩到统计行上沿 */
  ref?: React.Ref<HTMLTableSectionElement>;
}

const EMPTY_ROWS: unknown[] = [];

/**
 * 抹掉浮点运算的尾数噪声：如若干两位小数求和得到 61261.79000000001，
 * 保留 12 位有效数字后回到 61261.79，避免把 IEEE754 误差展示给用户
 */
const normalizeNumber = (value: number): number =>
  Number.isFinite(value) ? Number(value.toPrecision(12)) : value;

/** 数值展示：按指定精度输出固定小数位数；非有限数显示占位符 */
export const formatSummaryValue = (value: number, precision = 2): string => {
  if (!Number.isFinite(value)) {
    return '-';
  }
  const digits = Math.min(20, Math.max(0, Math.trunc(precision)));
  // 固定小数位数，而不是「最多 N 位并去尾零」：
  // 右对齐时最后一个字符贴齐单元格右边界，位数一致小数点才落在同一列上。
  // 去尾零会让 4.50 显示成 4.5，小数点反而右移一个字符宽度。
  return value.toFixed(digits);
};

/**
 * 取单个数值的小数位数：先抹掉浮点尾数再数位，
 * 避免 0.1+0.2=0.30000000000000004 这类噪声把位数算成 17
 */
const decimalPlaces = (value: number | string): number => {
  const n = isNumber(value) ? value : Number(value);
  if (!Number.isFinite(n) || Number.isInteger(n)) {
    return 0;
  }
  const text = n.toFixed(12).replace(/0+$/, '');
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
};

/**
 * 该列数据中出现的最大小数位数。
 * 统计值是这个列的聚合结果，用列自己的精度说话才能和列内内容的小数点对齐：
 * 列内都是一位小数（4.1/5.2）时，统计值也只留一位，而不是四舍五入成两位。
 */
const columnPrecision = (rows: unknown[], field: string): number => {
  let max = 0;
  rows.forEach((row) => {
    const value = get(row, field);
    if (isNumber(value) || (isString(value) && value.trim() !== '')) {
      max = Math.max(max, decimalPlaces(value));
    }
  });
  return max;
};

/** 取该列参与统计的数值：空值、非数值一律跳过，字符串形式的数字按数值处理 */
const readNumbers = (rows: unknown[], field: string): number[] => {
  const numbers: number[] = [];
  rows.forEach((row) => {
    const value = get(row, field);
    if (isNumber(value) && Number.isFinite(value)) {
      numbers.push(value);
      return;
    }
    if (isString(value) && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numbers.push(parsed);
      }
    }
  });
  return numbers;
};

/**
 * 内置统计：values 已滤除空值与非数值。
 * 用 reduce 而非 Math.max(...values)，避免超长列表展开参数导致调用栈溢出
 */
const BUILT_IN: Record<SummaryType, (values: number[], rows: unknown[]) => number> = {
  [SummaryType.Sum]: (values) => values.reduce((total, value) => total + value, 0),
  [SummaryType.Avg]: (values) =>
    values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length,
  [SummaryType.Count]: (values) => values.length,
  [SummaryType.Max]: (values) =>
    values.length === 0 ? 0 : values.reduce((max, value) => (value > max ? value : max), values[0]),
  [SummaryType.Min]: (values) =>
    values.length === 0 ? 0 : values.reduce((min, value) => (value < min ? value : min), values[0]),
};

/** 内置方式的结果先抹掉浮点噪声，再按列内精度交给 formatter 或默认格式化 */
const resolveBuiltIn = (
  item: TableSummaryItem,
  values: number[],
  rows: unknown[],
  precision: number,
) => {
  const compute = BUILT_IN[item.type ?? SummaryType.Sum];
  const result = normalizeNumber(compute(values, rows));
  return item.formatter ? item.formatter(result) : formatSummaryValue(result, precision);
};

/**
 * 表格底部统计行
 *
 * 与 VirtualTable 分开成独立组件，是为了保住表格的结构隔离契约：
 * 统计需要"全部行"（含未进入虚拟窗口的行），因此本组件按数据路径自行订阅；
 * 字段写入会替换数组引用从而触发本组件重算，但不会让表格结构层/单元格外壳重渲染
 * （见 viewTable.test.tsx 中 structure / cellShell 探针断言）。
 */
const TableSummaryRow: React.FC<TableSummaryRowProps> = (props) => {
  const { columns, items, summaryText, dataPath, ref } = props;
  const data = useData(dataPath);
  const rows = isArray(data) ? data : EMPTY_ROWS;

  // rows 引用变化即代表有字段写入或行结构变化，需要重算
  const cellContents = useMemo(() => {
    // 同一列允许配置多项统计（如「合计 / 平均」同格展示），按配置顺序并列输出
    const contents = new Map<string, React.ReactNode[]>();
    items.forEach((item) => {
      const values = readNumbers(rows, item.field);
      const custom: TableSummaryFn | undefined = item.summary;
      const rendered = custom
        ? custom(values, rows as Array<Record<string, unknown>>)
        // 未显式指定位数时按列内数据的最大小数位数输出，统计值与列内内容小数点同列
        : resolveBuiltIn(item, values, rows, item.precision ?? columnPrecision(rows, item.field));
      const list = contents.get(item.field);
      if (list) {
        list.push(rendered);
      } else {
        contents.set(item.field, [rendered]);
      }
    });
    return contents;
  }, [items, rows]);

  return (
    <tfoot ref={ref} className="sticky bottom-0 z-10">
      {/* 数字不额外加粗：粗体的等宽数字比常规字重更宽，右对齐后小数点会整体偏移。
          强调交给底色与「合计」文案，数字本身与数据行保持同一字重以对齐小数点 */}
      <tr className="bg-muted border-t">
        {columns.map((col, index) => {
          const content = cellContents.get(col.dataIndex);
          return (
            <td
              key={col.key}
              // 与表头、数据行同源：统一取 col.align，数字列额外用等宽数字对齐小数点
              className={cn(
                'border-border px-3 py-2 align-middle whitespace-nowrap',
                col.valueType === 'number' && 'tabular-nums',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
              )}
            >
              {/* 首列固定承载统计行说明，便于一眼看出该行含义 */}
              {index === 0 && (
                <span className="text-muted-foreground mr-2 font-medium">{summaryText}</span>
              )}
              {content?.map((node, nodeIndex) => (
                <Fragment key={nodeIndex}>
                  {nodeIndex > 0 && <span className="text-muted-foreground mx-1">/</span>}
                  {node}
                </Fragment>
              ))}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
};

export default TableSummaryRow;
