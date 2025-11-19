import { ConfigProvider } from 'antd';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useRoutes } from 'react-router-dom';
import routes from '~react-pages';
import LoginLayout from './layouts/login/LoginLayout';
import MainLayout from './layouts/main/MainLayout';
import themeDefault from './theme/themeDefault';

const routesWithRedirect = [
  {
    path: '/login',
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
