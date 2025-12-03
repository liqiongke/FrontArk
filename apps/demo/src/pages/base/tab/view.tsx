import { VType, ViewBase, type VProps } from '@jl/framework';
import Handler from './handler';
import type Data from './data';

class View extends ViewBase<Handler, Data> {
  form1: VProps.Form = {
    id: 'form1',
    type: VType.Form,
    path: ['form'],
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
    ],
  };

  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    path: ['table'],
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '库存', field: 'stock' },
      { title: '状态', field: 'status' },
    ],
  };

  tab: VProps.Tab = {
    type: VType.LayoutTab,
    id: 'tab',
    items: [
      {
        key: 'table1',
        label: '表格',
        viewId: this.table1.id,
      },
      {
        key: 'form1',
        label: '表单',
        viewId: this.form1.id,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    items: [this.tab.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
