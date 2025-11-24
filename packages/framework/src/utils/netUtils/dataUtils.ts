import { SysDataProps } from '@/data/interface';
import { KeyAttr } from '@/interface';
import {
  get,
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isString,
  isUndefined,
  set,
} from 'lodash';

// 标志是数据源类型的参数名称
const DataSourceParamName = ['@dataSource', '@list'];

// 标志是视图参数类型的参数名称
const ViewParamName = ['@pagination', '@active'];

// 可能提取的key值的属性名称
const KeyParamName = ['id', 'key', 'code'];

// 将数据源和视图参数进行拆分的数据
interface ExtractData {
  data?: any;
  params?: any;
}

// 数据处理的基本工具
export class DataUtils {
  // 加工并处理数据
  static extractCoreData = (data: any): ExtractData => {
    // 如果是基础数据类型,则直接返回
    if (isUndefined(data) || isNull(data) || isString(data) || isNumber(data) || isBoolean(data)) {
      return { data };
    }

    if (isArray(data)) {
      return { data };
    }

    let coreData, params;
    // 遍历data的所有属性,如果有符合DataSourceParamName则判定为coreData
    for (const key in data) {
      if (DataSourceParamName.includes(key)) {
        coreData = data[key];
      }
      // 如果有符合ViewParamName则判定为params
      if (ViewParamName.includes(key)) {
        params = data[key];
      }
    }

    if (isUndefined(coreData)) {
      coreData = data;
    }

    return { data: coreData, params };
  };

  // 初始化数据源,为所有的对象和数组进行赋值Key值
  static initData = (data: any, req: SysDataProps): any => {
    if (isUndefined(data) || isNull(data)) {
      return;
    }

    if (isArray(data)) {
      return data.map((item) => this.initData(item, req));
    }

    if (isObject(data)) {
      // 当前值已经设置了key
      if (!isUndefined(get(data, KeyAttr))) {
        return data;
      }
      // 如果req.keyAttr有值,尝试从data中取值并拼接成key值
      let keyValue: string | undefined;
      if (req.keyAttr) {
        if (isArray(req.keyAttr)) {
          // 如果是数组，拼接多个字段值
          keyValue = req.keyAttr
            .map((attr) => get(data, attr))
            .filter((val) => !isUndefined(val) && !isNull(val))
            .join('_');
        } else {
          // 如果是字符串，直接取值
          keyValue = get(data, req.keyAttr);
        }
      }

      // 如果没有值,尝试通过KeyParamName去获取值,按照顺序只取一个
      if (!keyValue) {
        for (const keyName of KeyParamName) {
          const val = get(data, keyName);
          if (!isUndefined(val) && !isNull(val)) {
            keyValue = String(val);
            break;
          }
        }
      }

      // 如果还是没有获取值,则生成一个全局唯一ID
      if (!keyValue) {
        keyValue = `key_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      }

      // 设置key值到data对象中
      set(data, KeyAttr, keyValue);
      return data;
    }
  };
}
