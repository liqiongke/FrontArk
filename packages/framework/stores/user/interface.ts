

export interface IUserStoreData<U,M> {
  user?:U;
  menu?:M[];
}

export interface IUserStoreActions<U,M> {
  setUser(user:U):void;
  getUser():U|undefined;
  setMenu(menu:M[]):void;
  getMenu():M[];
}

// 存储用户登录信息, 菜单信息
export interface IUserStoreBase<U,M> extends IUserStoreData<U,M>, IUserStoreActions<U,M> {}
