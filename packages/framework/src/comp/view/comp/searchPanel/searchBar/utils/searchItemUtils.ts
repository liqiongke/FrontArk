import { isArray, isBoolean, isNil, isString, isUndefined } from 'lodash';

import { Ctrl } from '@/comp/control/interface';
import { DEFAULT_DATE_FORMAT } from '@/utils/dateUtils';
import { type SearchPlaneItem, type SearchValueKind } from '../../interface';

// ctrl.type -> 值形态:未显式声明 valueKind 时的推导依据
const CTRL_KIND_MAP = new Map<Ctrl, SearchValueKind>([
  [Ctrl.Input, 'text'],
  [Ctrl.Text, 'text'],
  [Ctrl.Link, 'text'],
  [Ctrl.Upload, 'text'],
  [Ctrl.Select, 'enum'],
  [Ctrl.Radio, 'enum'],
  [Ctrl.Checkbox, 'enum'],
  [Ctrl.Switch, 'bool'],
  [Ctrl.Date, 'date'],
  [Ctrl.DateRange, 'dateRange'],
  [Ctrl.Time, 'text'],
  [Ctrl.TimeRange, 'timeRange'],
]);

// 区间形态的值用「~」连接,多值形态用「/」连接
const RANGE_KINDS: SearchValueKind[] = ['dateRange', 'timeRange'];

/** 取字段的值形态:valueKind 优先,其次按 ctrl.type 推导,最后缺省 text */
export const resolveValueKind = (item: SearchPlaneItem): SearchValueKind => {
  if (item.valueKind) {
    return item.valueKind;
  }
  if (item.ctrl?.type) {
    return CTRL_KIND_MAP.get(item.ctrl.type) ?? 'text';
  }
  return 'text';
};

/** 取字段声明的日期格式,缺省 YYYY-MM-DD */
export const resolveDateFormat = (item: SearchPlaneItem) => {
  const ctrl = item.ctrl as { format?: unknown } | undefined;
  const format = isString(ctrl?.format) ? ctrl.format : undefined;
  return format ?? DEFAULT_DATE_FORMAT;
};

/**
 * 值区控件配置:
 * 声明的 ctrl 与值形态一致时直接复用(枚举选项、日期格式等以声明为准),
 * 否则按值形态合成最小可用配置
 */
export const buildValueCtrl = (item: SearchPlaneItem, kind: SearchValueKind) => {
  const ctrl = item.ctrl;
  if (ctrl && CTRL_KIND_MAP.get(ctrl.type) === kind) {
    return ctrl;
  }
  const format = resolveDateFormat(item);
  switch (kind) {
    case 'bool':
      return { type: Ctrl.Switch } as const;
    case 'enum':
      return { type: Ctrl.Select, items: ctrl && 'items' in ctrl ? ctrl.items : [] } as const;
    case 'date':
      return { type: Ctrl.Date, format } as const;
    case 'dateRange':
      return { type: Ctrl.DateRange, format } as const;
    case 'timeRange':
      return { type: Ctrl.TimeRange } as const;
    default:
      return { type: Ctrl.Input } as const;
  }
};

/** 枚举字段的选项,非枚举或未声明选项时返回空数组 */
export const resolveFieldOptions = (item: SearchPlaneItem) => {
  const ctrl = item.ctrl;
  if (ctrl && 'items' in ctrl && isArray(ctrl.items)) {
    return ctrl.items;
  }
  return [];
};

/** 值是否为空(未填写):提交前据此拦截,不产生空条件 */
export const isEmptySearchValue = (kind: SearchValueKind, value: any) => {
  if (isNil(value)) {
    return true;
  }
  if (RANGE_KINDS.includes(kind)) {
    if (!isArray(value)) {
      return true;
    }
    // 区间控件未选完时为 ['',''] 或 [start,'']
    return value.every((part) => isNil(part) || part === '');
  }
  if (isString(value)) {
    return value.trim() === '';
  }
  if (kind === 'bool') {
    return isUndefined(value);
  }
  return false;
};

/** 单个值的展示文本 */
const formatSingleValue = (value: any): string => {
  if (isNil(value)) {
    return '';
  }
  if (isBoolean(value)) {
    return value ? '是' : '否';
  }
  return String(value);
};

/**
 * 条件展示文本:
 * - 区间 ['2026-10-01','2026-10-03'] -> '2026-10-01 ~ 2026-10-03'
 * - 多值 ['A','B'] -> 'A / B'
 */
export const formatSearchValue = (kind: SearchValueKind, value: any): string => {
  if (isArray(value)) {
    const parts = value.map(formatSingleValue).filter((part) => part !== '');
    if (parts.length === 0) {
      return '';
    }
    return parts.join(RANGE_KINDS.includes(kind) ? ' ~ ' : ' / ');
  }
  return formatSingleValue(value);
};
