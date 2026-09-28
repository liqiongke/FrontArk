import { Ctrl, VType, ViewBase, type VProps } from '@jl/framework';
import type Handler from './handler';
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

  modal: VProps.Modal = {
    id: 'modal',
    type: VType.LayoutModal,
    title: '产品信息',
    viewId: this.form1.id,
  };

  toolbar: VProps.ToolBar = {
    type: VType.Toolbar,
    id: 'toolbar',
    items: [
      {
        type: Ctrl.Button,
        text: '打开弹出框',
        onClick: this.handler.openModal,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    // 弹窗由 ViewRoot 自动挂载，布局中只放触发工具栏。
    items: [this.toolbar.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
