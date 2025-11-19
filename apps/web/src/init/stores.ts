import { createUserStore } from 'framework';
import type { User } from '../interface/user';
import type { MenuItem } from '../interface/menu';

// 通用的store类型
class Store {
  static user = createUserStore<User, MenuItem>();
}

export default Store;
