// 包装返回值
export const repData = (data: any, code: number = 200, msg: string = '') => {
  return {
    code: code,
    message: msg,
    data: data,
  };
};
