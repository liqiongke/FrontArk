import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  onSetData = () => {
    this.setData(['form', 'name'], new Date().toLocaleString());
  };

  getReqTableData = () => {
    this.get('/demo/base/table/get', { name: 'test' });
  };

  postData = () => {
    this.post('/demo/base/table/post', { name: 'test' });
  };
}

export default Handler;
