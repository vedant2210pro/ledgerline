import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, ArrowUpRight, ChevronDown, X, Menu } from 'lucide-react';
import Brand from '../components/Brand';
import { modules } from '../modules';
import { useAuth } from '../auth/context';
export default function AppLayout() {
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const path = location.pathname.split('/')[2] || '';
  const current = modules.find((module) => module.path === path);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const first = sidebar.current?.querySelector<HTMLButtonElement>('button');
    first?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        mobileTrigger.current?.focus();
      }
      if (event.key === 'Tab') {
        const items = sidebar.current?.querySelectorAll<HTMLElement>('a, button');
        if (!items?.length) return;
        const visible = Array.from(items).filter((item) => item.getClientRects().length);
        const firstItem = visible[0],
          lastItem = visible[visible.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        }
        if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mobileOpen]);
  const closeMobile = () => {
    setMobileOpen(false);
    mobileTrigger.current?.focus();
  };
  return (
    <div
      className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}
    >
      <a className="skip-link" href="#app-main">
        Skip to content
      </a>
      {mobileOpen && (
        <button className="sidebar-backdrop" aria-label="Close sidebar" onClick={closeMobile} />
      )}
      <aside className="sidebar" ref={sidebar} aria-label="Workspace navigation">
        <div className="sidebar-brand">
          <Brand compact={collapsed} />
          <button
            className="icon-button mobile-toggle"
            aria-label="Close sidebar"
            onClick={closeMobile}
          >
            <X />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">L</span>
          <div>
            <strong>Ledgerline workspace</strong>
            <small>Banking & payroll</small>
          </div>
        </div>
        <span className="nav-group-label">WORKSPACE</span>
        <nav>
          {modules.map(({ path, title, Icon }, index) => (
            <NavLink
              end={path === ''}
              key={path}
              to={`/app${path ? `/${path}` : ''}`}
              className={({ isActive }) =>
                `${isActive ? 'active' : ''} ${index === 8 ? 'nav-divider' : ''}`
              }
              title={collapsed ? title : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={19} />
              <span>{title}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/">
            Back to website <ArrowUpRight size={16} />
          </Link>
          <button
            className="collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} />
            ) : (
              <>
                <PanelLeftClose size={20} />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>
      <div className="app-content" inert={mobileOpen}>
        <header className="app-topbar">
          <button
            ref={mobileTrigger}
            className="icon-button mobile-toggle"
            aria-label="Open sidebar"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </button>
          <nav aria-label="Breadcrumb">
            <Link to="/app">Workspace</Link>
            <span>/</span>
            <span aria-current="page">{current?.title || 'Page not found'}</span>
          </nav>
          <details className="profile-menu">
            <summary>
              <span className="avatar">
                {user?.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <span className="profile-label">{user?.name}</span>
              <ChevronDown size={15} />
            </summary>
            <div>
              <strong>{user?.name}</strong>
              <p>{user?.roles.map((r) => r.replaceAll('_', ' ')).join(', ')}</p>
              <button
                disabled={loggingOut}
                onClick={async () => {
                  setLoggingOut(true);
                  setLogoutError('');
                  try {
                    await logout();
                  } catch (e) {
                    setLogoutError(e instanceof Error ? e.message : 'Sign out failed.');
                  } finally {
                    setLoggingOut(false);
                  }
                }}
              >
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </button>
              {logoutError && <p role="alert">{logoutError}</p>}
              <Link to="/">Back to website</Link>
            </div>
          </details>
        </header>
        <div className="preview-banner">
          <span className="status-dot" />
          <strong>Connected workspace</strong>
          <span>Banking and payroll workflows are connected. All amounts are in INR.</span>
        </div>
        <main id="app-main" className="app-main">
          <Outlet />
        </main>
        <footer className="app-footer">
          Ledgerline · Academic demonstration<span>Authenticated record management</span>
        </footer>
      </div>
    </div>
  );
}
