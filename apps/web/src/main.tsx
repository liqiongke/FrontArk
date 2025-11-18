import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useRoutes } from 'react-router-dom'
import routes from '~react-pages'

export const App: React.FC = () => {
  const element = useRoutes(routes);

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
