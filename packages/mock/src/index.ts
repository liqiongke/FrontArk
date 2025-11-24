import express, { Request, Response, NextFunction } from 'express';
import { repData } from './utils/dataUtils';
import loginRouter from './routes/login';
import menuRouter from './routes/sys';
import demoRouter from './routes/demo/demoBase';

const app = express();
const port = process.env.PORT;

// Middleware to handle JSON bodies
app.use(express.json());

// Enable CORS for all routes
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization',
  );
  next();
});

// Handle preflight requests
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.sendStatus(200);
  } else {
    next();
  }
});

// 注册路由
app.use('/api/login', loginRouter);
app.use('/api/menu', menuRouter);
app.use('/api/demo', demoRouter);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json(repData({}));
});

app.listen(port, () => {
  // 使用标准输出而不是 console.log
  process.stdout.write(`Mock server running at http://localhost:${port}\n`);
});
