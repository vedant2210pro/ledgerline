import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context';
export default function ProtectedRoute() {
  const auth = useAuth(),
    location = useLocation();
  if (auth.loading)
    return (
      <div className="page-loading" role="status">
        Checking your session…
      </div>
    );
  if (auth.error)
    return (
      <main className="page-loading">
        <p role="alert">{auth.error}</p>
        <button className="button" onClick={auth.reload}>
          Retry connection
        </button>
      </main>
    );
  return auth.user ? (
    <Outlet />
  ) : (
    <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />
  );
}
