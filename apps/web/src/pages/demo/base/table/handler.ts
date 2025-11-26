import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  openModal = () => {
    // this.setData(['table', 'value1'], new Date().toLocaleString());
    // console.log('data', this.getAllData());
    const modalHandler = this.getModalHandler('modal');
    modalHandler.show();
  };

  onSetData = () => {
    this.setData(['form', 'name'], new Date().toLocaleString());
  };
}

export default Handler;
