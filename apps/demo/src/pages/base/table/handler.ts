import { HandlerBase, PathKey, printStats, resetStats } from '@jl/framework';
import type { DataNodePath } from './data';

class Handler extends HandlerBase {
  onPrintData = () => {
    // console.log(this.getData([PathKey.Req, 'table']));
    console.log(this.getData([PathKey.Data]));
  };
  onSetData = () => {
    // 路径首段受 DataNodeId 约束,写成 ['forms', 'model'] 会在编译期报错
    const path: DataNodePath = ['form', 'model'];
    this.setData(path, new Date().toLocaleString());
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
