import { ConfigProvider } from 'antd';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import routes from '~react-pages';
import init from './init/init';
import LoginLayout from './layouts/login/LoginLayout';
import MainLayout from './layouts/main/MainLayout';
import themeDefault from './theme/themeDefault';

const routesWithRedirect = [
  {
    path: import.meta.env.VITE_LOGIN_URL,
    element: <LoginLayout />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [...routes],
  },
];

export const App: React.FC = () => {
  const element = useRoutes(routesWithRedirect);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <ConfigProvider theme={themeDefault}>{element}</ConfigProvider>
    </Suspense>
  );
};

// 初始化界面通用配置
init();

const container = document.getElementById('root')!;
const root = createRoot(container);

if (import.meta.hot) {
  // HMR更新时卸载组件
  import.meta.hot.dispose(() => {
    root.unmount();
  });
}

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
