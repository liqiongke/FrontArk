/**
 * 语义模型常量与判定规则。
 *
 * 「编辑能力」的判定是本项目最关键的产出：前端只按 editability 决定用哪种控件，
 * 任何拿不准的形态一律降级为 source-only —— 宁可只读，不可猜错写坏源码。
 */

/** 节点种类。 */
export const Kind = {
  PAGE: 'page',
  VIEW: 'view',
  DATA: 'data',
  HANDLER: 'handler',
  PROP: 'prop', // 泛化的属性节点（含嵌套对象/数组项）
  ARRAY_ITEM: 'arrayItem',
  FILE: 'file',
};

/**
 * 可编辑性。
 * - literal        标量字面量，可直接改
 * - string         字符串字面量（单独列出，便于前端用文本控件）
 * - number / boolean 同理
 * - object / array 结构容器，可增删子项
 * - enumRef        枚举成员访问（VType.Table / Ctrl.Select …）
 * - memberRef      this.xxx.yyy 成员链路
 * - callRef        DataBase.active(this.x.id) 这类有框架语义的调用
 * - handlerRef     this.handler.method
 * - moduleRef      模块级常量引用（如 CATEGORY_OPTIONS），只跳转不改
 * - expr           箭头函数 / 模板串 / 展开 / 未知表达式，只读
 * - sourceOnly     兜底只读
 */
export const Editable = {
  LITERAL: 'literal',
  OBJECT: 'object',
  ARRAY: 'array',
  ENUM_REF: 'enumRef',
  MEMBER_REF: 'memberRef',
  CALL_REF: 'callRef',
  HANDLER_REF: 'handlerRef',
  MODULE_REF: 'moduleRef',
  EXPR: 'expr',
  SOURCE_ONLY: 'sourceOnly',
};

/** 框架导出的枚举对象名 → 声明位置（供前端生成下拉选项）。 */
export const ENUM_OBJECTS = {
  VType: { label: '视图类型', source: '@view/interface' },
  Ctrl: { label: '控件类型', source: '@ctrl/interface' },
  RenderMode: { label: '渲染模式', source: '@view/table/interface' },
  SummaryType: { label: '统计方式', source: '@view/table/interface' },
  PathKey: { label: '取值路径键', source: '@store/interface' },
};

/** 有框架语义的调用：成员名 → 语义标识。 */
export const CALL_REF_OBJECTS = {
  DataBase: { member: 'active', kind: 'active', label: '焦点行绑定（视图 id）' },
  ViewPathUtils: { member: 'active', kind: 'active', label: '焦点行绑定（视图 id）' },
};

/** 视图类型 → 中文名（前端展示用；与框架枚举上的 @name 保持一致，作为兜底）。 */
export const VIEW_TYPE_LABELS = {
  VIEW_TABLE: '表格',
  VIEW_FORM: '表单',
  VIEW_TOOLBAR: '工具栏',
  LAYOUT_FLEX: 'Flex 布局',
  LAYOUT_TAB: '标签页',
  LAYOUT_MODAL: '弹出框',
  LAYOUT_DRAWER: '抽屉',
};

/** 控件类型 → 中文名。 */
export const CTRL_LABELS = {
  TEXT: '文本',
  INPUT: '输入框',
  BUTTON: '按钮',
  SELECT: '下拉',
  SWITCH: '开关',
  RADIO: '单选',
  CHECKBOX: '多选',
  DATE: '日期',
  DATE_RANGE: '日期区间',
  TIME: '时间',
  TIME_RANGE: '时间区间',
  LINK: '链接',
  UPLOAD: '上传',
};

/** 参与「结构」的视图节点类型（可用于布局容器判定）。 */
export const LAYOUT_TYPES = ['LAYOUT_FLEX', 'LAYOUT_TAB', 'LAYOUT_MODAL', 'LAYOUT_DRAWER'];
