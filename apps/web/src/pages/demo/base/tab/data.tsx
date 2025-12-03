import { DataBase, type DataProps } from '@jl/framework';

class Data extends DataBase {
  mainView: DataProps = {
    id: 'table',
    url: '/demo/base/table',
    keyAttr: 'id',
  };

  mainForm: DataProps = {
    id: 'form',
    url: '/demo/base/form',
  };
}

export default Data;