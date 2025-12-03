import HandlerViewBase, { HandlerViewInterface } from '@/handler/handlerViewBase';
import { ParamKey } from '@/stores/store/interface';

interface HandlerModal extends HandlerViewInterface {
  open: () => void;
  close: () => void;
}

class HandlerModalImpl extends HandlerViewBase implements HandlerModal {
  open = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, true);
  };
  close = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, false);
  };
}

export default HandlerModalImpl;
