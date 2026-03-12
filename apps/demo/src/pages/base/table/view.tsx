import { Ctrl, VType, ViewBase, type VProps } from '@jl/framework';
import type Data from './data';
import type Handler from './handler';

class View extends ViewBase<Handler, Data> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.mainTable.id,
    searchItems: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
    ],
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '库存', field: 'stock' },
      { title: '状态', field: 'status' },
      { title: '销量', field: 'sales' },
      { title: '评分', field: 'rating' },
      { title: '颜色', field: 'color' },
      { title: '保修期', field: 'warranty' },
      { title: '创建时间', field: 'createTime' },
    ],
  };

  form1: VProps.Form = {
    id: 'form1',
    type: VType.Form,
    dataId: this.data.mainFormData.id,
    items: [
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '库存', field: 'stock' },
    ],
    toolList: [
      {
        type: Ctrl.Button,
        text: '打印数据',
        onClick: this.handler.onPrintData,
      },
      {
        type: Ctrl.Button,
        text: '设置数据',
        onClick: this.handler.onSetData,
      },
      {
        type: Ctrl.Button,
        text: '获取getData使用情况',
        onClick: this.handler.printDataStats,
      },
      {
        type: Ctrl.Button,
        text: '重置GetData使用情况',
        onClick: this.handler.resetDataStats,
      },
      {
        type: Ctrl.Button,
        text: 'POST请求',
        onClick: this.handler.btnPostReqData,
      },
      {
        type: Ctrl.Button,
        text: 'GET请求',
        onClick: this.handler.btnGetReqData,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    items: [this.form1.id, this.table1.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
