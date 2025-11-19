import { Router, Request, Response } from 'express';
import { menuData, MenuItem } from './data';

// 创建路由实例
const router: Router = Router();

/**
 * 用户登录
 * POST /api/login
 */
router.post('/', (req: Request, res: Response) => {
  // 获取用户提交的用户名和密码
  const { username, password } = req.body;

  // 简单验证逻辑（实际项目中应该有更严格的验证）
  if (!username || !password) {
    return res.status(400).json({
      code: 400,
      message: '用户名和密码不能为空',
      data: null,
    });
  }

  // 模拟验证成功，生成token（实际项目中应该使用JWT或其他安全方式）
  const token = `Bearer ${Date.now()}_${username}_${Math.random().toString(36).substring(2)}`;

  const response = {
    code: 200,
    message: '登录成功',
    data: {
      user: {
        name: username,
        auth: [username == 'admin' ? 'worker' : 'admin'],
      },
      menu: menuData,
    },
  };

  // 将token添加到响应头中
  res.setHeader('Authorization', token);
  res.json(response);
});

export { router as loginRouter, menuData };
export type { MenuItem };
