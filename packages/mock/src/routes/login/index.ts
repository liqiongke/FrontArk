import { Router, Request, Response } from 'express';
import { repData } from '../../utils/dataUtils';

// 创建路由实例
const loginRouter: Router = Router();

/**
 * 用户登录
 * POST /api/login
 */
loginRouter.post('/', (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      code: 400,
      message: '用户名和密码不能为空',
      data: null,
    });
  }

  // 模拟验证成功，生成token（实际项目中应该使用JWT或其他安全方式）
  const token = `Bearer ${Date.now()}_${username}_${Math.random().toString(36).substring(2)}`;

  const response = repData({
    name: username,
    auth: [username == 'admin' ? 'worker' : 'admin'],
  });

  // 设置CORS头部，允许前端访问authorization响应头
  res.setHeader('Access-Control-Expose-Headers', 'authorization, X-Rate-Limit');
  // 将token添加到响应头中
  res.setHeader('authorization', token);
  res.json(response);
});

export default loginRouter;
