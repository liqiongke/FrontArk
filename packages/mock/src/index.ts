import express, { Request, Response, NextFunction } from 'express';
import { menuRouter } from './routes/menu';

const app = express();
const port = 3001;

// Middleware to handle JSON bodies
app.use(express.json());

// Enable CORS for all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Handle preflight requests
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.sendStatus(200);
  } else {
    next();
  }
});

// 注册路由
app.use('/api/menu', menuRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  const response = {
    code: 200,
    message: 'Mock Server is running',
    data: {
      endpoints: [
        '/api/menu',
        '/api/menu/flat',
        '/api/users',
        '/api/products',
        '/api/orders'
      ]
    }
  };
  res.json(response);
});

app.listen(port, () => {
  // 使用标准输出而不是 console.log
  process.stdout.write(`Mock server running at http://localhost:${port}\n`);
  process.stdout.write(`API endpoints:\n`);
  process.stdout.write(`  - http://localhost:${port}/api/users\n`);
  process.stdout.write(`  - http://localhost:${port}/api/products\n`);
  process.stdout.write(`  - http://localhost:${port}/api/orders\n`);
});