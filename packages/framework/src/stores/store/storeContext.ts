import { createContext } from 'react';
import { type StoreApi, type UseBoundStore } from 'zustand';
import { type IStoreBase } from './interface';

const StoreContext = createContext<UseBoundStore<StoreApi<IStoreBase>>>(null!);

export default StoreContext;
