import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, BriefcaseBusiness, FileText, LayoutDashboard, LogOut, Map, Settings, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const nav = [
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/heatmap', 'Risk Heatmap', Map],
  ['/alerts', 'Alerts', Bell],
  ['/complaints', 'Complaints Registry', FileText],
  ['/investigations/CYB-2026-1024', 'Investigations', BriefcaseBusiness],
  ['/settings', 'Profile & Settings', Settings],
] as const;


export function DashboardLayout() {
  const { user: u, logout } = useAuth();
  const navigate = useNavigate();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const signOut = () => {
    logout();
    navigate('/login');
  };


  useEffect(() => {
    const closeMenu = (event: MouseEvent) => {
      if (accountMenu.current && !accountMenu.current.contains(event.target as Node)) {
        accountMenu.current.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && accountMenu.current) accountMenu.current.open = false;
    };
    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>
            CYBER<span>SENTINEL</span>
          </span>
        </div>
        <p className="system-tag">PREDICTIVE INTELLIGENCE</p>
        <nav>
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <details className="account-menu" ref={accountMenu}>
          <summary className="user-card">
            <div className="avatar">{u?.name.slice(0, 1)}</div>
            <div>
              <b>{u?.name}</b>
              <small>{u?.role}</small>
            </div>
          </summary>
          <div className="account-popover">
            <button onClick={() => navigate('/settings')}>
              <UserCircle size={15} /> Account / Profile
            </button>
            <button onClick={signOut}>
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </details>
      </aside>
      <main className="main-content">
        <div className="topbar">
          <span className="live">
            <span className="live-dot" aria-hidden="true" />
            LIVE THREAT TELEMETRY
          </span>
          <button className="topbar-signout" onClick={signOut}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
