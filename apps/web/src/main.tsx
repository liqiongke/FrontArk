import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import routes from '~react-pages'
import MainLayout from './layouts/main/MainLayout'
import LoginLayout from './layouts/login/LoginLayout'
import { ConfigProvider } from 'antd'
import themeDefault from './theme/themeDefault'

const routesWithRedirect = [
  {
    path: '/login',
    element: <LoginLayout />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      ...routes
    ]
  }
];

export const App: React.FC = () => {
  const element = useRoutes(routesWithRedirect);

  return (
    <Suspense fallback={<p>Loading...</p>}>
      {element}
    </Suspense>
  );
}

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
      <ConfigProvider theme={themeDefault}>
        <App />
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>
);
