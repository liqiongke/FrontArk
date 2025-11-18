import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import routes from '~react-pages'
import MainLayout from './layouts/main/MainLayout'
import LoginLayout from './layouts/login/LoginLayout'

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
