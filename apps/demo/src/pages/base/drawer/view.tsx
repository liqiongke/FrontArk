import { Ctrl, VType, ViewBase, type VProps } from '@jl/framework';
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

  drawer: VProps.Drawer = {
    id: 'drawer',
    type: VType.LayoutDrawer,
    width: 720,
    viewId: this.form1.id,
  };

  toolbar: VProps.ToolBar = {
    type: VType.Toolbar,
    id: 'toolbar',
    items: [
      {
        type: Ctrl.Button,
        text: '打开Drawer',
        onClick: this.handler.openDrawer,
      },
    ],
  };

  layout: VProps.Flex = {
    id: 'layout',
    type: VType.LayoutFlex,
    items: [this.toolbar.id, this.drawer.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
