import { ViewRoot } from '@jl/framework';
import Data from './data';
import Handler from './handler';
import VType from './view';

// @studio-name 表格表单页面
const DemoTablePage = () => {
  return <ViewRoot ViewClass={VType} DataClass={Data} HandlerClass={Handler} />;
};

export default DemoTablePage;
