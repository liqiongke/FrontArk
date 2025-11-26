import HandlerViewBase, { HandlerViewInterface } from '@/handler/handlerViewBase';
import { ParamKey } from '@/stores/store/useView';

interface HandlerModal extends HandlerViewInterface {
  show: () => void;
  hide: () => void;
}

class HandlerModalImpl extends HandlerViewBase implements HandlerModal {
  show = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, true);
  };
  hide = () => {
    this.getStore().setViewParamByKey(this.viewId, ParamKey.Open, false);
  };
}

export default HandlerModalImpl;
