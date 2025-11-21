import { createContext } from 'react';
import { StoreApi, UseBoundStore } from 'zustand';
import { IStoreBase } from './interface';

const StoreContext = createContext<UseBoundStore<StoreApi<IStoreBase>>>(null!);

export default StoreContext;
