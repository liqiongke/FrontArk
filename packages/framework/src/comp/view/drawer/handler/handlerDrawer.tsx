import HandlerViewBase, { type HandlerViewInterface } from '@/handler/handlerViewBase';
import { ParamKey } from '@/stores/store/interface';

interface HandlerDrawer extends HandlerViewInterface {
  open: () => void;
  close: () => void;
}

class HandlerDrawerImpl extends HandlerViewBase implements HandlerDrawer {
  open = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, true);
  };
  close = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, false);
  };
}

export default HandlerDrawerImpl;
