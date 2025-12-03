import { useContext } from 'react';
import StoreContext from '../storeContext';

/**
 * 设置请求相关数据
 */
export const useReq = (viewId: string) => {
  const useStore = useContext(StoreContext);
  const params = useStore((state) => state.getReqParams(viewId));

  const sendReq = useStore((state) => state.sendReq);
  return [params, sendReq];
};
