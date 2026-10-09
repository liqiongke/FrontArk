/**
 * 新建节点/列/页面的代码模板。
 *
 * 只提供「结构正确、能被框架接受」的最小模板；缩进与换行由 edit.mjs 按目标文件风格重排。
 */

/** 新增表格列的模板。 */
export function tableColumnTemplate(index = 0) {
  return `{ title: '新列${index + 1}', field: 'field${index + 1}' }`;
}

/** 新增搜索项的模板。 */
export function searchItemTemplate(index = 0) {
  return `{
    title: '新搜索项',
    field: 'field${index + 1}',
    valueKind: 'text',
    ctrl: { type: Ctrl.Input },
  }`;
}

/** 新增统计项的模板。 */
export function summaryItemTemplate() {
  return `{ field: 'field1', type: SummaryType.Sum }`;
}

/** 新增表单字段的模板。 */
export function formItemTemplate() {
  return `{ title: '新字段', field: 'field1' }`;
}

/** 新增按钮的模板。 */
export function buttonTemplate() {
  return `{ type: Ctrl.Button, variant: 'outline', text: '新按钮', onClick: this.handler.onNewButton }`;
}

/** 新增视图节点（默认 Flex 布局）。 */
export function viewTemplate({ memberName, id }) {
  return `  ${memberName}: VProps.Flex = {
    id: ${JSON.stringify(id)},
    type: VType.LayoutFlex,
    gutter: 12,
    items: [],
  };`;
}

/** 新增数据节点。 */
export function dataTemplate({ memberName, id }) {
  return `  ${memberName}: DataProps = {
    id: ${JSON.stringify(id)},
    url: '/${memberName}',
  } satisfies DataProps;`;
}

/** 新增页面的四个文件。 */
export function pageTemplates({ className, relativeImport }) {
  const index = `import { ViewRoot } from '@jl/framework';
import Data from './data';
import Handler from './handler';
import VType from './view';

const ${className}Page = () => {
  return <ViewRoot ViewClass={VType} DataClass={Data} HandlerClass={Handler} />;
};

export default ${className}Page;
`;

  const data = `import { DataBase, type DataProps } from '@jl/framework';

class Data extends DataBase {
  main = {
    id: 'main' as const,
    url: '${relativeImport}',
    keyAttr: 'id',
  } satisfies DataProps;
}

export default Data;

export type DataNodeId = Data['main']['id'];
export type DataNodePath = [DataNodeId, ...(string | number)[]];
`;

  const view = `import { VProps, VType, ViewBase } from '@jl/framework';
import type Data from './data';
import type Handler from './handler';

class View extends ViewBase<Handler, Data> {
  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    gutter: 12,
    items: [this.form1.id, this.table1.id],
  };

  form1: VProps.Form = {
    id: 'form1',
    type: VType.Form,
    dataId: this.data.main.id,
    items: [{ title: '名称', field: 'name' }],
  };

  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.main.id,
    items: [
      { title: '名称', field: 'name' },
      { title: '创建时间', field: 'createTime' },
    ],
  };

  getRootId = () => this.layout.id;
}

export default View;
`;

  const handler = `import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  onNewButton = () => {
    this.setData(['main', 'updatedAt'], new Date().toLocaleString());
  };
}

export default Handler;
`;

  // ST011：新增页面是**两步走**，这里必须把第二步说出来。
  // 路由由 vite-plugin-pages 扫 src/pages 自动发现（建目录即生效），
  // 但后端菜单是另一份数据（mock 的 menuData，key 就是路由路径），不会自动同步。
  // 把它作为结构化提示随模板一起返回，前端在"新增页面"流程里直接展示，
  // 免得用户以为菜单也跟着建好了。
  const notes = [
    {
      code: 'ST011',
      level: 'info',
      message:
        '新增页面后，前端路由会被 vite-plugin-pages 自动发现；但后端菜单需要单独登记（mock 的 menuData.key 用该路由路径）。',
    },
  ];

  return { index, data, view, handler, notes };
}

/**
 * 可插入项清单（前端「+ 添加」菜单的数据来源）。
 * @param {string} key 容器语义键：items / searchItems / summaryItems / toolList / formItems
 */
export function candidatesFor(key, index = 0) {
  switch (key) {
    case 'items':
      return [{ id: 'table-column', label: '默认列', text: tableColumnTemplate(index) }];
    case 'searchItems':
      return [{ id: 'search-text', label: '文本搜索项', text: searchItemTemplate(index) }];
    case 'summaryItems':
      return [{ id: 'summary-sum', label: '求和统计', text: summaryItemTemplate() }];
    case 'toolList':
      return [{ id: 'button', label: '按钮', text: buttonTemplate() }];
    case 'formItems':
      return [{ id: 'form-field', label: '字段', text: formItemTemplate() }];
    default:
      return [];
  }
}
