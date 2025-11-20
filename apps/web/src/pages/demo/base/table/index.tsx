import Data from './data';
import View from './view';
import Handler from './handler';
import ViewRoot from 'framework/src/view';
const DemoTablePage = () => {
  return <ViewRoot ViewClass={View} DataClass={Data} HandlerClass={Handler} />;
};

export default DemoTablePage;
