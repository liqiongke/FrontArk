import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

import { DEFAULT_DATE_FORMAT } from '@/utils/dateUtils';

dayjs.extend(customParseFormat);

// 纯数字日期(yyyymmdd)与分隔符日期(yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd)
const DATE_PATTERNS = ['YYYY-MM-DD', 'YYYY/M/D', 'YYYY.MM.DD', 'YYYYMMDD'];

// 相对日期关键词:中文输入也能推断为日期字段
const RELATIVE_TODAY = ['今天', '今日'];
const RELATIVE_YESTERDAY = ['昨天', '昨日'];
const RELATIVE_BEFORE_YESTERDAY = ['前天'];
const RECENT_DAYS_PATTERN = /^(?:近|最近|过去)(\d{1,3})天$/;

// 区间分隔符:2026-10-01 ~ 2026-10-03 / 至 / 到 / ...
const RANGE_SPLIT_PATTERN = /\s*(?:~|～|至|到)\s*|\.{3}/;

export interface DateRangeValue {
  start: string;
  end: string;
}

const format = (date: dayjs.Dayjs) => date.format(DEFAULT_DATE_FORMAT);

/** 严格解析单个日期文本,支持绝对日期与「今天/昨天/前天/近N天」;非法返回 undefined */
export const parseDateInput = (text: string): string | undefined => {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  if (RELATIVE_TODAY.includes(value)) {
    return format(dayjs());
  }
  if (RELATIVE_YESTERDAY.includes(value)) {
    return format(dayjs().subtract(1, 'day'));
  }
  if (RELATIVE_BEFORE_YESTERDAY.includes(value)) {
    return format(dayjs().subtract(2, 'day'));
  }
  const recent = RECENT_DAYS_PATTERN.exec(value);
  if (recent) {
    const days = Math.min(Number(recent[1]), 365);
    return format(dayjs().subtract(days - 1, 'day'));
  }
  for (const pattern of DATE_PATTERNS) {
    const parsed = dayjs(value, pattern, true);
    if (parsed.isValid()) {
      return parsed.format(DEFAULT_DATE_FORMAT);
    }
  }
  return undefined;
};

/**
 * 解析区间文本:
 * - `2026-10-01 ~ 2026-10-03` 显式区间
 * - `2026-10-01` / `今天` 单值展开为当天
 * - `近7天` 展开为 [今天-6, 今天]
 * - `本月` / `今年` 展开为自然月 / 自然年
 * 任一端无法解析返回 undefined
 */
export const parseDateRangeInput = (text: string): DateRangeValue | undefined => {
  const value = text.trim();
  if (!value) {
    return undefined;
  }
  if (value === '本月' || value === '这个月') {
    const now = dayjs();
    return { start: format(now.startOf('month')), end: format(now.endOf('month')) };
  }
  if (value === '今年' || value === '本年') {
    const now = dayjs();
    return { start: format(now.startOf('year')), end: format(now.endOf('year')) };
  }
  const parts = value.split(RANGE_SPLIT_PATTERN).map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const start = parseDateInput(parts[0]);
    const end = parseDateInput(parts[parts.length - 1]);
    if (start && end) {
      // 容错:用户写成 10-05 ~ 10-01 时交换两端
      return dayjs(start).isAfter(dayjs(end)) ? { start: end, end: start } : { start, end };
    }
    return undefined;
  }
  const recent = RECENT_DAYS_PATTERN.exec(value);
  if (recent) {
    return { start: parseDateInput(value) as string, end: format(dayjs()) };
  }
  const single = parseDateInput(value);
  if (!single) {
    return undefined;
  }
  return { start: single, end: single };
};

/** 形状判定:文本是否为(单)日期 */
export const isDateText = (text: string) => !!parseDateInput(text);

/** 形状判定:文本是否为日期区间(含相对日期) */
export const isDateRangeText = (text: string) => !!parseDateRangeInput(text);

/** 形状判定:文本是否为合法数字(允许负数与小数) */
export const isNumberText = (text: string) => {
  const value = text.trim();
  return value !== '' && Number.isFinite(Number(value));
};

/** 形状判定:文本是否为布尔意图(仅中英文常见写法,避免误吞普通文本) */
export const isBoolText = (text: string) => {
  const value = text.trim().toLowerCase();
  return ['true', 'false', '是', '否', '1', '0', '有', '无'].includes(value);
};
