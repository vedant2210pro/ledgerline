import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation, Link } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AppLayout from './layouts/AppLayout';
import ModuleStatusPage from './pages/ModuleStatusPage';
import NotFoundPage from './pages/NotFoundPage';
import AuthProvider from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';

import RecordsPage from './pages/RecordsPage';
import RecordPage from './pages/RecordPage';
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const SystemPage = lazy(() => import('./pages/SystemPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const PayrollPage = lazy(() => import('./pages/PayrollPage'));
const DashboardPreviewPage = lazy(() => import('./pages/DashboardPreviewPage'));
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === '/' ? 'Banking & Payroll' : pathname === '/login' ? 'Sign in' : 'Workspace'} | Ledgerline`;
  }, [pathname]);
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div className="page-loading" role="status">
            Opening Ledgerline…
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/preview"
            element={
              <main className="public-preview">
                <div className="preview-nav">
                  <Link className="text-link" to="/">
                    Back to website
                  </Link>
                  <Link className="button" to="/login">
                    Sign in to workspace
                  </Link>
                </div>
                <div className="notice">
                  Fictional dashboard illustration. These figures are not your database records.
                </div>
                <DashboardPreviewPage />
              </main>
            }
          />
          <Route element={<ProtectedRoute />}>
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              {(['customers', 'accounts', 'branches', 'employees'] as const).map((module) => (
                <Route key={module} path={module}>
                  <Route index element={<RecordsPage key={module} module={module} />} />
                  <Route path="new" element={<RecordPage key={module + 'new'} module={module} />} />
                  <Route path=":id" element={<RecordPage key={module} module={module} />} />
                </Route>
              ))}
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="payroll" element={<PayrollPage key="list" />} />
              <Route path="payroll/:id" element={<PayrollRoute />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="users" element={<UsersPage key="list" />} />
              <Route path="users/:id" element={<UserRoute />} />
              <Route path="audit-logs" element={<AuditPage />} />
              <Route path="settings" element={<SystemPage />} />
              <Route path=":module" element={<ModuleStatusPage />} />
              <Route path="*" element={<NotFoundPage embedded />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

function PayrollRoute() {
  const { pathname } = useLocation();
  return <PayrollPage key={pathname} />;
}

function UserRoute() {
  const { pathname } = useLocation();
  return <UsersPage key={pathname} />;
}
