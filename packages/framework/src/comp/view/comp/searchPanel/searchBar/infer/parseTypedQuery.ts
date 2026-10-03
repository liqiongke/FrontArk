/**
 * 显式语法解析(复刻 Sentry 的 key:value / GitHub 的限定符)
 *
 * 支持 `tr:TR001`、`tr=TR001`、`状态:在售` 三种书写,只做「切分」不做语义判断,
 * key 是否命中字段、value 是否合法由推断引擎按 SearchPlaneItem 元信息判定。
 * 纯函数,不依赖 store 与 UI,便于单测。
 */

// key 允许字母/数字/下划线/中文,长度上限 12,避免把普通文本误当作 key:值
const TYPED_PATTERN = /^\s*([A-Za-z0-9_一-龥]{1,12})\s*[:=]\s*([\s\S]*)$/;

export interface TypedQuery {
  // 用户书写的 key
  key: string;
  // key 之后的值(可能为空字符串,如 `tr:`)
  value: string;
}

/**
 * 解析显式语法;不是 `key:value` 形态时返回 undefined
 * `2026-10-01`、`13800138000` 等不含分隔符的输入不会被误解析
 */
export const parseTypedQuery = (raw: string): TypedQuery | undefined => {
  if (!raw) {
    return undefined;
  }
  const matched = TYPED_PATTERN.exec(raw);
  if (!matched) {
    return undefined;
  }
  return { key: matched[1].trim(), value: matched[2].trim() };
};
