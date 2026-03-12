import { ViewRoot } from '@jl/framework';
import Data from './data';
import Handler from './handler';
import View from './view';
const DemoModalPage = () => {
  return <ViewRoot ViewClass={View} DataClass={Data} HandlerClass={Handler} />;
};

export default DemoModalPage;