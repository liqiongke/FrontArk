import { Ctrl, DataBase, RenderMode, VType, ViewBase, type VProps } from '@jl/framework';
import type Data from './data';
import type Handler from './handler';

class View extends ViewBase<Handler, Data> {
  table1: VProps.Table = {
    id: 'table1',
    type: VType.Table,
    dataId: this.data.mainTable.id,
    // 启用结构订阅模式:字段编辑仅更新对应控件,不再带动表格外壳更新
    // (本页无本地排序/过滤/行选择依赖;行键缺失/重复/非字符串时框架自动回退经典模式)
    renderMode: RenderMode.Subscription,
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
    // 绑定 table1 的焦点行:字段路径解析为 [table, 焦点行下标, field],读取与回写都落在焦点行数据上
    // 表单按 path 取数(ViewForm 不消费 dataId),且 @Active: 引用必须指向视图 id 而非数据节点 id
    path: [DataBase.active(this.table1.id)],
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
