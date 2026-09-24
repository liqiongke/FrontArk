import { toast } from 'sonner';

/**
 * 框架统一消息服务（Sonner 封装）
 * - 模块级函数：非 React 环境的网络回调、Handler 也可直接调用
 * - 应用根节点需挂载一次 framework 的 <Toaster />
 */
export const notify = {
  success: (message: string, description?: string) => {
    toast.success(message, { description });
  },
  error: (message: string, description?: string) => {
    toast.error(message, { description });
  },
  info: (message: string, description?: string) => {
    toast.info(message, { description });
  },
  warning: (message: string, description?: string) => {
    toast.warning(message, { description });
  },
  loading: (message: string) => {
    return toast.loading(message);
  },
  dismiss: (id?: string | number) => {
    toast.dismiss(id);
  },
};

export default notify;
