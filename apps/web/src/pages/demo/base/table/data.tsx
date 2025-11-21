import { DataBase, type DataProps } from '@jl/framework';

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
