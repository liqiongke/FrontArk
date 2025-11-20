import DataProps from './interface';

abstract class DataBase {
  [key: string]: DataProps;
}

export default DataBase;
