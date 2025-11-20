import {
  CtrlType,
  type ViewFormProps,
  type ViewStructBase,
  type ViewTableProps,
  ViewType,
} from 'framework';
import Handler from './handler';
import ViewBase from 'framework/src/comp/viewBase';

class View extends ViewBase<Handler> {
  form1: ViewFormProps = {
    id: 'form1',
    type: ViewType.VIEW_FORM,
    path: ['form'],
    items: [
      { title: '用户姓名', field: 'name' },
      { title: '实际年龄', field: 'age' },
      { title: 'T3', field: 'name', ctrl: { type: CtrlType.CTRL_INPUT } },
      { title: 'T4', field: 'age', ctrl: { type: CtrlType.CTRL_INPUT } },
      { title: 'T5', field: 'name' },
      { title: 'T6', field: 'name' },
      { title: 'T7', field: 'name' },
      { title: 'T8', field: 'name' },
      { title: 'T9', field: 'name' },
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

  table1: ViewTableProps = {
    id: 'table1',
    type: ViewType.VIEW_TABLE,
    rowKey: 'id',
    path: ['table'],
    items: [
      { title: 'Id', field: 'id' },
      { title: '用户姓名', field: 'name' },
      { title: '标题', field: 'title', ctrl: { type: CtrlType.CTRL_INPUT } },
    ],
  };

  layout: ViewStructBase = {
    id: 'layout',
    type: ViewType.LAYOUT_FLEX,
    children: [this.form1.id, this.table1.id],
  };

  getRootId = () => this.layout.id;
}

export default View;
