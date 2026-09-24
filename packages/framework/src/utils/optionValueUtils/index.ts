import { isBoolean, isNumber, isUndefined } from 'lodash';
import { type ValueType } from '@/interface';

/**
 * 选项值 <-> UI 字符串 ID 编解码
 *
 * Radix Select/Radio 只接受字符串值，而业务 OptionItem.value 是 ValueType
 * (string|number|boolean|undefined)。带类型前缀的双向映射保证
 * 数字 1、字符串 '1'、false、0、空字符串、undefined 互不混淆，
 * 禁止统一 String(value) 后写回破坏业务数据类型。
 */
const PREFIX = {
  undefined: 'u:',
  boolean: 'b:',
  number: 'n:',
  string: 's:',
} as const;

export function encodeOptionValue(value: ValueType): string {
  if (isUndefined(value)) {
    return PREFIX.undefined;
  }
  if (isBoolean(value)) {
    return PREFIX.boolean + (value ? '1' : '0');
  }
  if (isNumber(value)) {
    return PREFIX.number + String(value);
  }
  return PREFIX.string + value;
}

export function decodeOptionValue(id: string): ValueType {
  if (id.startsWith(PREFIX.undefined)) {
    return undefined;
  }
  if (id.startsWith(PREFIX.boolean)) {
    return id.slice(PREFIX.boolean.length) === '1';
  }
  if (id.startsWith(PREFIX.number)) {
    const num = Number(id.slice(PREFIX.number.length));
    return Number.isNaN(num) ? undefined : num;
  }
  if (id.startsWith(PREFIX.string)) {
    return id.slice(PREFIX.string.length);
  }
  // 未知格式按原字符串兜底（历史数据兼容）
  return id;
}
