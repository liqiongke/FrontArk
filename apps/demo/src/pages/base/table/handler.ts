import { HandlerBase, PathKey, printStats, resetStats } from '@jl/framework';

class Handler extends HandlerBase {
  onPrintData = () => {
    console.log(this.getData([PathKey.Req, 'table']));
  };
  onSetData = () => {
    this.setData(['form', 'model'], new Date().toLocaleString());
  };

  printDataStats = () => {
    printStats('getData');
  };

  resetDataStats = () => {
    resetStats('getData');
  };

  btnGetReqData = () => {
    this.get('/demo/base/table/get', { name: 'test' });
  };

  btnPostReqData = () => {
    this.post('/demo/base/table/post', { name: 'test' });
  };
}

export default Handler;
