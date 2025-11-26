import { C, V, ViewBase, type VProps } from '@jl/framework';
import Handler from './handler';

const options = [
  { label: '1', value: 'V1' },
  { label: '2', value: 'V2' },
  { label: '3', value: 'V3' },
];

class View extends ViewBase<Handler> {
  form1: VProps.Form = {
    id: 'form1',
    type: V.Form,
    path: ['form'],
    items: [
      { title: '测试text', field: 'id' },
      { title: '测试text', field: 'id', ctrl: { type: C.Text } },
      { title: '测试input', field: 'name' },
      { title: '测试input', field: 'name', ctrl: { type: C.Input } },
      { title: '测试select', field: 'select' },
      { title: '测试select', field: 'select', ctrl: { type: C.Select, items: options } },

      { title: '测试switch', field: 'switch' },
      { title: '测试switch', field: 'switch', ctrl: { type: C.Switch } },

      { title: '测试radio', field: 'radio' },
      { title: '测试radio', field: 'radio', ctrl: { type: C.Radio, items: options } },

      { title: 'Checkbox', field: 'checkbox' },
      { title: 'Checkbox', field: 'checkbox', ctrl: { type: C.Checkbox, items: options } },

      { title: 'Date', field: 'date' },
      { title: 'Date', field: 'date', ctrl: { type: C.Date } },

      { title: 'DateRange', field: 'dateRange' },
      { title: 'DateRange', field: 'dateRange', ctrl: { type: C.DateRange } },

      { title: 'Time', field: 'time' },
      { title: 'Time', field: 'time', ctrl: { type: C.Time } },

      { title: 'TimeRange', field: 'timeRange' },
      { title: 'TimeRange', field: 'timeRange', ctrl: { type: C.TimeRange } },

      { title: 'Link', field: 'link' },
      {
        title: 'Link',
        field: 'link',
        ctrl: { type: C.Link, href: { label: '测试', value: '/demo/composite/formAndTable' } },
      },

      { title: 'Upload', field: 'upload' },
      { title: 'Upload', field: 'upload', ctrl: { type: C.Upload } },

      // 以下是表单默认字段
      { title: '产品描述', field: 'description' },
      { title: '价格', field: 'price' },
      { title: '产品类别', field: 'category' },
      { title: '品牌', field: 'brand' },
      { title: '型号', field: 'model' },
      { title: '颜色', field: 'color' },
      { title: '存储容量', field: 'storage' },
      { title: '库存数量', field: 'stock' },
      { title: '状态', field: 'status' },
      { title: '重量', field: 'weight' },
      { title: '尺寸', field: 'dimensions' },
      { title: '保修期', field: 'warranty' },
      { title: '创建时间', field: 'createTime' },
    ],
    toolList: [
      {
        type: C.Button,
        text: '打开弹窗',
        onClick: this.handler.openModal,
      },
      {
        type: C.Button,
        text: '设置数据',
        onClick: this.handler.onSetData,
      },
    ],
  };

  table1: VProps.Table = {
    id: 'table1',
    type: V.Table,
    rowKey: 'id',
    path: ['table'],
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
      { title: '重量', field: 'weight' },
      { title: '保修期', field: 'warranty' },
      { title: '创建时间', field: 'createTime' },
    ],
  };

  tab: VProps.Tab = {
    type: V.LayoutTab,
    id: 'tab',
    items: [
      {
        key: 'form1',
        label: '表单',
        viewId: this.form1.id,
      },
      {
        key: 'table1',
        label: '表格',
        viewId: this.table1.id,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: V.LayoutFlex,
    items: [this.form1.id, this.tab.id],
  };

  modal: VProps.Modal = {
    id: 'modal',
    type: V.LayoutModal,
    viewId: this.form1.id,
  };

  getRootId = () => this.layout.id;
}

export default View;
