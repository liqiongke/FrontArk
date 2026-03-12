import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  openModal = () => {
    const modalHandler = this.getModalHandler('modal');
    modalHandler.open();
  };
}

export default Handler;