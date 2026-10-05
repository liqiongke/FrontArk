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

  // 获取当前勾选项的值数组并打印到控制台（行键数组 + 整行数据数组）
  onPrintSelected = () => {
    const keys = this.getSelectedKeys('table1');
    const rows = this.getSelectedRows('table1');
    console.log('勾选项的值数组（行键）:', keys);
    console.log('勾选项的值数组（整行数据）:', rows);
  };

  // 清空表格勾选
  onClearSelected = () => {
    this.setSelectedKeys('table1', []);
  };

  // 勾选变化：把当前勾选项写进表单数据节点，表单里的「已勾选项」直接读它
  // （selection.onChange 只在勾选集合真的变化时触发）
  onSelectionChange = (keys: Array<string | number>) => {
    this.setData(['form', 'selectionText'], keys.length ? `${keys.length} 项：${keys.join('、')}` : '');
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
