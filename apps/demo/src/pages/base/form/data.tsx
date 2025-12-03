import { DataBase, type DataProps } from '@jl/framework';

class Data extends DataBase {
  mainForm: DataProps = {
    id: 'form',
    url: '/demo/base/form',
  };
}

export default Data;