import { isArray } from 'lodash';

import { type SearchConditionTag, type SearchPlaneItem } from '../../interface';
import { formatSearchValue, isEmptySearchValue, resolveValueKind } from './searchItemUtils';

/**
 * 由 criteria 派生条件 Tag
 *
 * criteria 是唯一数据源:Tag 不持有状态,因此与高级搜索面板天然双向同步;
 * 顺序优先取 searchOrder,缺失顺序的字段按对象键追加;空值不生成 Tag
 */
export const buildConditionTags = (
  criteria: Record<string, any> | undefined,
  order: string[] | undefined,
  items: SearchPlaneItem[],
  lowConfidence: string[] = [],
): SearchConditionTag[] => {
  if (!criteria) {
    return [];
  }
  const fields = [...(isArray(order) ? order : []), ...Object.keys(criteria)];
  const seen = new Set<string>();
  const tags: SearchConditionTag[] = [];
  fields.forEach((field) => {
    if (seen.has(field)) {
      return;
    }
    seen.add(field);
    const item = items.find((each) => each.field === field);
    if (!item) {
      return;
    }
    const kind = resolveValueKind(item);
    const value = criteria[field];
    if (isEmptySearchValue(kind, value)) {
      return;
    }
    tags.push({
      field,
      title: item.title,
      text: formatSearchValue(kind, value),
      value,
      confidence: lowConfidence.includes(field) ? 'inferred' : 'locked',
    });
  });
  return tags;
};