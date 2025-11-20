import DataBase from 'framework/src/data/dataBase';
import type DataProps from 'framework/src/data/interface';

class Data extends DataBase {
  mainView: DataProps = {
    id: 'table',
    url: '/test/table',
  };

  mainForm: DataProps = {
    id: 'form',
    url: '/test/form',
  };
}

export default Data;
