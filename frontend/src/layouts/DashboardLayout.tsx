import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, BriefcaseBusiness, FileText, LayoutDashboard, LogOut, Map, Settings, UserCircle, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { TrafficSimulator } from '../components/TrafficSimulator';

const nav = [
  ['/dashboard', 'Dashboard', LayoutDashboard],
  ['/heatmap', 'Risk Heatmap', Map],
  ['/alerts', 'Alerts', Bell],
  ['/complaints', 'Complaints Registry', FileText],
  ['/cases', 'Investigation Cases', BriefcaseBusiness],
  ['/settings', 'Profile & Settings', Settings],
] as const;


export function DashboardLayout() {
  const { user: u, logout } = useAuth();
  const navigate = useNavigate();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

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
              <span>{label}</span>
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
          <div className="topbar-left">
            <span className="live">
              <span className="live-dot" aria-hidden="true" />
              LIVE THREAT TELEMETRY
            </span>
            <span className="classification-badge">LAW ENFORCEMENT SENSITIVE — OFFICIAL USE ONLY</span>
          </div>
          <div className="topbar-right">
            <button className="topbar-btn accent" onClick={() => navigate('/heatmap')}>
              <Map size={14} />
              Predictive Heatmap
            </button>
            <button className="topbar-btn simulate" onClick={() => setSimulatorOpen(true)}>
              <Zap size={14} />
              Simulate Traffic
            </button>
            <button className="topbar-signout" onClick={signOut}>
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        </div>
        <Outlet />
        {simulatorOpen && (
          <TrafficSimulator onClose={() => setSimulatorOpen(false)} />
        )}
      </main>
    </div>
  );
}
