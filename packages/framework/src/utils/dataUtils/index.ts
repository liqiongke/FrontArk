import { KeyAttr } from '@/interface';
import { get } from 'lodash';

class DataUtils {
  static getKey = (record: any) => {
    return get(record, KeyAttr);
  };
}

export default DataUtils;
