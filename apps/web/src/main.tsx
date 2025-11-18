import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import routes from '~react-pages'
import MainLayout from './layouts/MainLayout'
import LoginLayout from './layouts/LoginLayout'

const routesWithRedirect = [
  {
    path: '/login',
    element: <LoginLayout />,
    children: [
      // 登录相关的子路由可以在这里添加
    ]
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { path: '', redirect: '/home' },
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
