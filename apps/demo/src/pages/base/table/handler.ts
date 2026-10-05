import { HandlerBase, PathKey, printStats, resetStats } from '@jl/framework';
import type { DataNodePath } from './data';

class Handler extends HandlerBase {
  onPrintData = () => {
    // 显式提交焦点行待写输入，再读取；getData 本身不触发写入。
    this.flushDataScope(['@Active:table1']);
    console.log(this.getData([PathKey.Data]));
  };
  onSetData = () => {
    // 路径首段受 DataNodeId 约束,写成 ['forms', 'model'] 会在编译期报错
    const path: DataNodePath = ['form', 'model'];
    this.setData(path, new Date().toLocaleString());
  };

  // 读取表格勾选：行键（供接口传参）+ 整行记录（供本地处理）
  onPrintSelected = () => {
    const keys = this.getSelectedKeys('table1');
    const rows = this.getSelectedRows('table1');
    console.log('勾选行键', keys);
    console.log('勾选行数据', rows);
  };

  // 清空表格勾选
  onClearSelected = () => {
    this.setSelectedKeys('table1', []);
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
