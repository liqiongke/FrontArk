import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  openDrawer = () => {
    const drawerHandler = this.getModalHandler('drawer');
    drawerHandler.open();
  };
}

export default Handler;