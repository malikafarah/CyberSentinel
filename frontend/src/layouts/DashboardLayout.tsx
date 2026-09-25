import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Bell,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Network,
  Radio,
  Settings,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
  dot?: boolean;
}

const navItems: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/heatmap', label: 'Heatmap', icon: Map },
  { to: '/graph', label: 'Graph Workspace', icon: Network },
  { to: '/alerts', label: 'Alerts', icon: Bell, dot: true },
  { to: '/complaints', label: 'Complaints', icon: FileText },
  { to: '/cases', label: 'Cases', icon: BriefcaseBusiness },
  { to: '/threat-fusion', label: 'Threat Fusion', icon: Radio },
  { to: '/settings', label: 'Settings', icon: Settings },
];

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
      if (event.key === 'Escape') {
        if (accountMenu.current) accountMenu.current.open = false;
      }
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
      {/* Top Header Bar with integrated Capsule Dock */}
      <header className="cyber-top-header" aria-label="Command Overview Header">
        <div className="header-left">
          <div className="nav-brand" onClick={() => navigate('/dashboard')} role="button" tabIndex={0}>
            <span className="logo-icon" aria-hidden="true">
              <ShieldCheck size={20} className="brand-shield" />
            </span>
            <span className="brand-name">
              CYBER<span className="brand-accent">SENTINEL</span>
            </span>
          </div>
        </div>

        {/* Center: Navigation Dock (Capsule shape preserved, aligned with title) */}
        <div className="cyber-dock-wrapper" role="navigation" aria-label="Dock Navigation">
          <nav className="cyber-dock">
            {navItems.map(({ to, label, icon: Icon, badge, dot }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `dock-item ${isActive ? 'active' : ''}`}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="active-dock-pill"
                        className="dock-active-pill"
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      >
                        <div className="dock-active-glow" />
                      </motion.div>
                    )}
                    <div className="dock-icon-box">
                      <Icon size={16} />
                      {badge && <span className="dock-badge">{badge}</span>}
                      {dot && (
                        <span
                          className="dock-dot"
                          style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-4px',
                            width: '7px',
                            height: '7px',
                            backgroundColor: '#ef4444',
                            borderRadius: '50%',
                            boxShadow: '0 0 6px rgba(239, 68, 68, 0.8)',
                          }}
                        />
                      )}
                    </div>
                    <span className="dock-label">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <details className="account-menu" ref={accountMenu}>
            <summary className="user-card-pill" aria-label="User Account Menu">
              <div className="avatar">{u?.name ? u.name.slice(0, 1).toUpperCase() : 'U'}</div>
              <div className="user-info-text">
                <b>{u?.name || 'Operator'}</b>
                <small>{u?.role || 'Analyst'}</small>
              </div>
            </summary>
            <div className="account-popover">
              <button
                onClick={() => {
                  accountMenu.current && (accountMenu.current.open = false);
                  navigate('/settings');
                }}
              >
                <UserCircle size={15} /> Account / Settings
              </button>
              <button onClick={signOut} className="danger-action">
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          </details>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content main-content-docked">
        <Outlet />
      </main>
    </div>
  );
}
