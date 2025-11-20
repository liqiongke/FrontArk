import { Router, Request, Response } from 'express';
import { repData } from '../../utils/dataUtils';
import { menuData } from './menu';

// 创建路由实例
const menuRouter: Router = Router();

/**
 * 用户登录
 * POST /api/menu
 */
menuRouter.get('/', (req: Request, res: Response) => {
  res.json(repData(menuData));
});

export default menuRouter;
