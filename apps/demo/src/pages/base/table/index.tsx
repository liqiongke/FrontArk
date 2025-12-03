import { ViewRoot } from '@jl/framework';
import Data from './data';
import Handler from './handler';
import VType from './view';
const DemoTablePage = () => {
  return <ViewRoot ViewClass={VType} DataClass={Data} HandlerClass={Handler} />;
};

export default DemoTablePage;
