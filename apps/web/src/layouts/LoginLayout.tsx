import { Outlet } from 'react-router-dom';

const LoginLayout = () => {
  return (
    <div>
      <header>Login Layout Header</header>
      <main>
        <Outlet />
      </main>
      <footer>Login Layout Footer</footer>
    </div>
  );
};

export default LoginLayout;