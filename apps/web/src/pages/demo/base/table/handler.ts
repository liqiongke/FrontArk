import { HandlerBase } from '@jl/framework';

class Handler extends HandlerBase {
  onGetData = () => {
    // this.setData(['table', 'value1'], new Date().toLocaleString());
    console.log('data', this.getAllData());
  };

  onSetData = () => {
    this.setData(['form', 'name'], new Date().toLocaleString());
  };
}

export default Handler;
