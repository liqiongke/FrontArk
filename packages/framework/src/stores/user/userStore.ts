import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { type IUserStoreBase } from './interface';

const createUserStore = <User, Menu>() => {
  type UserStore = IUserStoreBase<User, Menu>;
  return create<UserStore, [['zustand/immer', never]]>(
    immer((zSet, zGet) => {
      return {
        user: undefined,
        menu: [],
        setUser: (user: User) => zSet({ user }),
        getUser: () => zGet().user,
        setMenu: (menu: Menu[]) => zSet({ menu }),
        getMenu: () => zGet().menu ?? [],
      };
    }),
  );
};

export default createUserStore;
