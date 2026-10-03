import { isArray, isString, trim } from 'lodash';

import { type SearchNormalizeResult, type SearchPlaneItem, type SearchValueKind } from '../../interface';
import { isDateText, parseDateInput, parseDateRangeInput } from './valueShape';

/** 枚举项取值(与 searchItemUtils.resolveFieldOptions 同源,此处局部实现避免循环依赖) */
const resolveEnumOptions = (item: SearchPlaneItem) => {
  const ctrl = item.ctrl;
  if (ctrl && 'items' in ctrl && isArray(ctrl.items)) {
    return ctrl.items;
  }
  return [];
};

/**
 * 值规范化:提交前把输入区草稿转成写入 criteria 的最终值
 * 纯函数,不读写 store
 */
export const normalizeSearchValue = (
  kind: SearchValueKind,
  raw: any,
  item?: SearchPlaneItem,
): SearchNormalizeResult => {
  switch (kind) {
    case 'number': {
      const text = trim(String(raw ?? ''));
      const value = Number(text);
      if (text === '' || Number.isNaN(value)) {
        return { ok: false, message: '请输入合法数字' };
      }
      return { ok: true, value };
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
      // text / timeRange:文本去首尾空白后提交
      const value = isString(raw) ? trim(raw) : raw;
      if (value === undefined || value === null || value === '') {
        return { ok: false, message: '请输入搜索内容' };
      }
      return { ok: true, value };
    }
  }
};
