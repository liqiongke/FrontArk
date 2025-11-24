// import { CtrlType } from '@/framework/comp/control/interface';
// import { ViewFormProps } from '@/framework/comp/view/form/interface';
// import { ViewStructBase, ViewType } from '@/framework/comp/view/interface';
// import { ViewTableProps } from '@/framework/comp/view/table/interface';
// import ViewBase from '@/framework/comp/viewBase';
import { CtrlType, ViewBase, ViewType } from '@jl/framework';
import { type V } from '@jl/framework';
import Handler from './handler';

class View extends ViewBase<Handler> {
  form1: V.Form = {
    id: 'form1',
    type: ViewType.VIEW_FORM,
    path: ['form'],
    items: [
      { title: '产品ID', field: 'id' },
      { title: '产品名称', field: 'name' },
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
        type: CtrlType.CTRL_BUTTON,
        onClick: this.handler.onGetData,
      },
      {
        type: CtrlType.CTRL_BUTTON,
        onClick: this.handler.onSetData,
      },
    ],
  };

  table1: V.Table = {
    id: 'table1',
    type: ViewType.VIEW_TABLE,
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

  layout: V.Base = {
    id: 'layout',
    type: ViewType.LAYOUT_FLEX,
    children: [this.form1.id, this.table1.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
