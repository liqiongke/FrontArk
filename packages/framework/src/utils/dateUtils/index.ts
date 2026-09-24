import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/** 日期/时间格式常量：与迁移前控件用法保持一致的默认 format */
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TIME_FORMAT = 'HH:mm:ss';

/** 默认日期时间 format（showTime 场景显式配置时优先使用业务值） */
export const DEFAULT_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

/**
 * 解析格式化字符串为本地 Date（日历/时间编辑器内部使用）
 * - 严格按 format 解析（customParseFormat），非法输入返回 null
 * - 本地日历语义，不经 UTC ISO 转换，避免日期偏移
 */
export function parseDate(value: string | undefined | null, format: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, format, true);
  return parsed.isValid() ? parsed.toDate() : null;
}

/** 序列化 Date 为格式化字符串；非法输入返回空字符串 */
export function formatDate(date: Date | null | undefined, format: string): string {
  if (!date) {
    return '';
  }
  const d = dayjs(date);
  return d.isValid() ? d.format(format) : '';
}

/** 时间字符串解析为当天 Date（用于 TimePicker 类编辑器回显） */
export function parseTime(value: string | undefined | null, format: string): Date | null {
  return parseDate(value, format);
}

/** 读取 store 值并保证为字符串数组（范围值契约：两个字符串，兼容 undefined 与既有空值） */
export function toRangeStrings(value: unknown): [string, string] {
  if (Array.isArray(value) && value.length >= 2) {
    return [value[0] ?? '', value[1] ?? ''];
  }
  return ['', ''];
}
