import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  openModal = () => {
    const modalHandler = this.getModalHandler('modal');
    modalHandler.show();
  };

  onSetData = () => {
    this.setData(['form', 'name'], new Date().toLocaleString());
  };

  getData = () => {
    this.get('/demo/base/table/get', { name: 'test' });
  };

  postData = () => {
    this.post('/demo/base/table/post', { name: 'test' });
  };
}

export default Handler;
