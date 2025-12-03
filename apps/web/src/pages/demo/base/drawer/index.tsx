import { ViewRoot } from '@jl/framework';
import Data from './data';
import Handler from './handler';
import View from './view';
const DemoDrawerPage = () => {
  return <ViewRoot ViewClass={View} DataClass={Data} HandlerClass={Handler} />;
};

export default DemoDrawerPage;
