import { Router, Request, Response } from 'express';
import { menuData, MenuItem } from './data';

// 创建路由实例
const router:Router = Router();

/**
 * 获取菜单列表
 * GET /api/menu
 */
router.get('/', (req: Request, res: Response) => {
  const response = {
    code: 200,
    message: 'success',
    data: menuData
  };
  
  res.json(response);
});

export { router as menuRouter, menuData };
export type { MenuItem };