import { isEmpty, isString, trim } from 'lodash';

import { type SearchInferResult, type SearchPlaneItem } from '../../interface';
import { parseTypedQuery } from './parseTypedQuery';
import { isBoolText, isDateRangeText, isDateText, isNumberText } from './valueShape';
import { resolveFieldOptions, resolveValueKind } from '../utils/searchItemUtils';

export interface InferSearchTypeOptions {
  // 已锁定的字段(用户显式选择):命中即最高优先级返回
  lockedField?: string;
}

const normalize = (text: string) => trim(text).toLowerCase();

/**
 * 取正则的字面量前缀:用于「模糊命中」
 * `^TR\d{6,}$` -> 'tr';无字面量前缀(如 /^\d+$/)返回空串,避免用数字误命中其他字段
 */
const literalPrefix = (source: string) => {
  const matched = /^[A-Za-z一-龥]+/.exec(source.replace(/^\^/, ''));
  return matched ? matched[0].toLowerCase() : '';
};

/** 按 weight 决胜(缺省 0),weight 相同取声明靠前者,保证结果稳定 */
const pickBest = (candidates: Array<{ item: SearchPlaneItem; weight: number }>) =>
  candidates.reduce((best, current) => (current.weight > best.weight ? current : best));

/** key 是否能指向某字段:field 名、title、keywords 均按「完全相等」匹配 */
const findByKey = (items: SearchPlaneItem[], key: string) => {
  const target = normalize(key);
  if (!target) {
    return undefined;
  }
  return items.find((item) => {
    if (normalize(item.field) === target || normalize(item.title) === target) {
      return true;
    }
    return (item.keywords ?? []).some((word) => normalize(word) === target);
  });
};

/** 第一条(声明顺序)匹配给定条件的字段 */
const findByKind = (items: SearchPlaneItem[], predicate: (item: SearchPlaneItem) => boolean) =>
  items.find(predicate);

/**
 * 搜索类型推断:纯函数,不读写 store
 *
 * 规则按可靠性自高而低执行(高优先级先命中即返回):
 * P0 locked  用户显式选择并锁定
 * P1 typed   `key:value` / `key=value` 显式语法(Sentry / GitHub 风格)
 * P2 shape   值形状(日期/区间/数字/布尔)—— 比正则可靠,故优先于正则
 * P3 regexp  字段正则完整命中
 * P4 prefix  字段正则的字面量前缀命中(`tr` -> 运输单号)
 * P5 option  输入文本等于某枚举项的 label
 * P6 keyword 输入文本等于某字段的 title / keywords
 * P7 primary 兜底字段,confidence 为 none(交还用户手动选择)
 */
export const inferSearchType = (
  raw: string,
  items: SearchPlaneItem[],
  options: InferSearchTypeOptions = {},
): SearchInferResult => {
  const text = trim(raw ?? '');
  const { lockedField } = options;

  // P0:已锁定,输入不再改写类型
  if (isString(lockedField) && !isEmpty(lockedField)) {
    return { field: lockedField, confidence: 'locked', rule: 'locked' };
  }

  if (!text || isEmpty(items)) {
    return { confidence: 'none' };
  }

  // P1:显式语法
  const typed = parseTypedQuery(text);
  if (typed) {
    const matched = findByKey(items, typed.key);
    if (matched) {
      return { field: matched.field, confidence: 'exact', rule: 'typed', value: typed.value, key: typed.key };
    }
    // key 未命中:不静默吞掉输入,按未识别处理并保留原文
    return { confidence: 'none', rule: 'typed-miss', value: text };
  }

  // P2:值形状
  if (isDateRangeText(text)) {
    const item = findByKind(items, (each) => resolveValueKind(each) === 'dateRange');
    if (item) {
      return { field: item.field, confidence: 'inferred', rule: 'shape-range' };
    }
  }
  if (isDateText(text)) {
    const item = findByKind(items, (each) => resolveValueKind(each) === 'date');
    if (item) {
      return { field: item.field, confidence: 'inferred', rule: 'shape-date' };
    }
  }
  if (isNumberText(text)) {
    const item = findByKind(items, (each) => resolveValueKind(each) === 'number');
    if (item) {
      return { field: item.field, confidence: 'inferred', rule: 'shape-number' };
    }
  }
  if (isBoolText(text)) {
    const item = findByKind(items, (each) => resolveValueKind(each) === 'bool');
    if (item) {
      return { field: item.field, confidence: 'inferred', rule: 'shape-bool' };
    }
  }

  // P3:正则完整命中
  const exactCandidates = items
    .filter((item) => {
      if (!item.regExp) {
        return false;
      }
      try {
        return item.regExp.test(text);
      } catch {
        // 非法正则不参与推断,交由后续规则
        return false;
      }
    })
    .map((item) => ({ item, weight: item.weight ?? 0 }));
  if (exactCandidates.length > 0) {
    return { field: pickBest(exactCandidates).item.field, confidence: 'exact', rule: 'regexp' };
  }

  // P4:正则字面量前缀命中(`tr` -> 运输单号)
  const lowerText = normalize(text);
  const prefixCandidates = items
    .filter((item) => !!item.regExp)
    .filter((item) => {
      const prefix = literalPrefix(item.regExp?.source ?? '');
      return prefix.length >= 2 && lowerText.startsWith(prefix);
    })
    .map((item) => ({ item, weight: item.weight ?? 0 }));
  if (prefixCandidates.length > 0) {
    return { field: pickBest(prefixCandidates).item.field, confidence: 'inferred', rule: 'prefix' };
  }

  // P5:枚举值匹配(输入文本等于某枚举项的 label)
  const optionItem = items.find((item) => {
    if (resolveValueKind(item) !== 'enum') {
      return false;
    }
    return resolveFieldOptions(item).some((option) => normalize(option.label ?? '') === lowerText);
  });
  if (optionItem) {
    return { field: optionItem.field, confidence: 'inferred', rule: 'option' };
  }

  // P6:标题/别名匹配(用户直接输入字段名)
  const keywordItem = findByKey(items, text);
  if (keywordItem) {
    return { field: keywordItem.field, confidence: 'inferred', rule: 'keyword' };
  }

  // P7:兜底字段,仍未识别类型,由调用方提示用户手动选择
  const primary = items.find((item) => item.primary);
  if (primary) {
    return { field: primary.field, confidence: 'none', rule: 'primary' };
  }
  return { confidence: 'none' };
};
