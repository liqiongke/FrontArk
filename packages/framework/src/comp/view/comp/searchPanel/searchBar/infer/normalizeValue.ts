import { isArray, isString, trim } from 'lodash';

import { type SearchNormalizeResult, type SearchPlaneItem, type SearchValueKind } from '../../interface';
import { isDateText, parseDateInput, parseDateRangeInput, splitMultiValues } from './valueShape';

/** 枚举项取值(与 searchItemUtils.resolveFieldOptions 同源,此处局部实现避免循环依赖) */
const resolveEnumOptions = (item: SearchPlaneItem) => {
  const ctrl = item.ctrl;
  if (ctrl && 'items' in ctrl && isArray(ctrl.items)) {
    return ctrl.items;
  }
  return [];
};

export interface NormalizeValueOptions {
  /**
   * 是否把逗号分隔的输入拆成多值
   * - 数字字段恒为 true:数字里不可能含逗号,'123,234' 只能是两个值
   * - 文本字段仅在「编辑已有条件」时为 true:普通文本搜索里的逗号是内容的一部分,不能擅自拆开
   */
  split?: boolean;
}

/**
 * 值规范化:提交前把输入区草稿转成写入 criteria 的最终值
 * 纯函数,不读写 store
 *
 * 多值形态统一产出数组(单值仍是标量),与 criteria 里「同字段多值」的既有结构一致
 */
export const normalizeSearchValue = (
  kind: SearchValueKind,
  raw: any,
  item?: SearchPlaneItem,
  options: NormalizeValueOptions = {},
): SearchNormalizeResult => {
  const { split = false } = options;
  switch (kind) {
    case 'number': {
      const texts = split ? splitMultiValues(String(raw ?? '')) : [trim(String(raw ?? ''))];
      if (texts.length === 0 || texts.some((text) => text === '' || !Number.isFinite(Number(text)))) {
        return { ok: false, message: '请输入合法数字' };
      }
      const values = texts.map(Number);
      return { ok: true, value: values.length === 1 ? values[0] : values };
    }
    case 'date': {
      const text = trim(String(raw ?? ''));
      if (text === '') {
        return { ok: false, message: '请选择日期' };
      }
      // 已按 format 序列化的值(如 2026-10-01)在此统一归一
      const value = isDateText(text) ? parseDateInput(text) : undefined;
      if (!value) {
        return { ok: false, message: '日期格式无法识别' };
      }
      return { ok: true, value };
    }
    case 'dateRange': {
      // 区间控件已产出 [start,end]
      if (isArray(raw)) {
        return raw.length >= 2 && raw[0] && raw[1]
          ? { ok: true, value: [raw[0], raw[1]] }
          : { ok: false, message: '请选择完整的起止日期' };
      }
      const range = parseDateRangeInput(String(raw ?? ''));
      if (!range) {
        return { ok: false, message: '日期区间无法识别' };
      }
      return { ok: true, value: [range.start, range.end] };
    }
    case 'bool': {
      if (typeof raw === 'boolean') {
        return { ok: true, value: raw };
      }
      const text = trim(String(raw ?? '')).toLowerCase();
      if (['true', '是', '1', '有'].includes(text)) {
        return { ok: true, value: true };
      }
      if (['false', '否', '0', '无'].includes(text)) {
        return { ok: true, value: false };
      }
      return { ok: false, message: '请选择是否' };
    }
    case 'enum': {
      // 控件已写入业务值;文本输入场景下按 label / value 反查
      if (isString(raw) && item) {
        const text = trim(raw);
        const matched = resolveEnumOptions(item).find(
          (option) => String(option.value) === text || option.label === text,
        );
        if (matched) {
          return { ok: true, value: matched.value };
        }
      }
      if (raw === undefined || raw === null || raw === '') {
        return { ok: false, message: '请选择一项' };
      }
      return { ok: true, value: raw };
    }
    default: {
      // text / timeRange:文本去首尾空白后提交;区间与多值控件的数组值原样透传
      if (!isString(raw)) {
        if (raw === undefined || raw === null || raw === '') {
          return { ok: false, message: '请输入搜索内容' };
        }
        return { ok: true, value: raw };
      }
      const texts = split ? splitMultiValues(raw) : [trim(raw)];
      if (texts.length === 0 || texts.some((text) => text === '')) {
        return { ok: false, message: '请输入搜索内容' };
      }
      return { ok: true, value: texts.length === 1 ? texts[0] : texts };
    }
  }
};
