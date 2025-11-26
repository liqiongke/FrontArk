import { Router, Request, Response } from 'express';
import { repData } from '../../utils/dataUtils';
import Mock from 'mockjs';

// 创建路由实例
const demoRouter: Router = Router();

/**
 * 获取表单数据
 * GET /api/demo/base/form
 */
demoRouter.get('/base/form', (req: Request, res: Response) => {
  const formData = {
    id: 'PRD001',
    name: 'iPhone 15 Pro',
    description: '最新款苹果智能手机，配备A17 Pro芯片，支持5G网络',
    price: 8999.0,
    category: '手机数码',
    brand: '苹果',
    model: 'iPhone 15 Pro',
    color: '深空黑色',
    storage: '256GB',
    stock: 150,
    status: '在售',
    weight: '0.187kg',
    dimensions: '146.6 x 70.6 x 8.25 mm',
    warranty: '1年全国联保',
    createTime: '2024-01-15 10:30:00',
  };

  const response = repData(formData);
  res.json(response);
});

/**
 * 获取产品列表数据
 * GET /api/demo/base/table
 */
demoRouter.get('/base/table', (req: Request, res: Response) => {
  // 从查询参数获取分页信息
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const total = 100; // 模拟总数据量

  // 使用MockJS生成产品列表数据
  const mockData = Mock.mock({
    'list|10': [
      {
        id: 'PRD@integer(1, 999)',
        name: '产品@integer(1, 1000)',
        price: '@float(100, 9999, 2, 2)',
        'category|1': ['手机数码', '家电', '服装', '图书', '运动户外', '美妆个护'],
        'brand|1': ['苹果', '华为', '小米', '三星', '索尼', 'Nike', 'Adidas', '戴尔', '联想'],
        'stock|1-500': 100,
        'status|1': ['在售', '缺货', '下架'],
        'sales|1000-99999': 5000,
        rating: '@float(3.0, 5.0, 1, 1)',
        'color|1': ['黑色', '白色', '金色', '银色', '蓝色', '红色'],
        'weight|0.1-10.0': 1.5,
        'warranty|1': ['1年', '2年', '3年'],
        createTime: '@datetime("yyyy-MM-dd HH:mm:ss")',
      },
    ],
  });

  const response = repData({
    '@list': mockData.list,
    '@pagination': {
      current: page,
      pageSize: pageSize,
      total: total,
      totalPages: Math.ceil(total / pageSize),
    },
  });

  res.json(response);
});

/**
 * 获取表格数据
 * GET /api/table/get
 */
demoRouter.get('/base/table/get', (req: Request, res: Response) => {
  const tableData = {
    id: 'TABLE001',
    name: '示例表格',
    description: '这是一个示例表格数据',
    createTime: new Date().toLocaleString(),
    status: 'active',
    data: [
      { id: 1, name: '项目1', value: 100, status: '完成' },
      { id: 2, name: '项目2', value: 200, status: '进行中' },
      { id: 3, name: '项目3', value: 300, status: '待开始' },
    ],
  };

  const response = repData(tableData);
  res.json(response);
});

/**
 * 提交表格数据
 * POST /api/table/post
 */
demoRouter.post('/base/table/post', (req: Request, res: Response) => {
  const requestData = req.body;

  // 模拟处理提交的数据
  const result = {
    success: true,
    message: '数据提交成功',
    receivedData: requestData,
    processTime: new Date().toLocaleString(),
  };

  const response = repData(result);
  res.json(response);
});

export default demoRouter;
