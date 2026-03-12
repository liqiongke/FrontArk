import { createUserStore } from '@jl/framework';
import type { MenuItem } from '../interface/menu';
import type { User } from '../interface/user';

// 通用的store类型
class Store {
  static user = createUserStore<User, MenuItem>();
}

export default Store;
