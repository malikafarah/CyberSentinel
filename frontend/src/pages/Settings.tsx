import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PageHeader } from '../components/ui';
import { Moon, Sun } from 'lucide-react';

export function Settings() {
  const { user: u } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="page">
      <PageHeader eyebrow="PROFILE & PREFERENCES" title="Operational profile" />
      <section className="panel profile">
        <div className="avatar large">{u?.name ? u.name.slice(0, 1) : 'O'}</div>
        <div>
          <h2>{u?.name || 'Officer'}</h2>
          <p style={{ color: 'var(--accent)', fontWeight: 700 }}>{u?.role || 'LEA Officer'}</p>
          <p>{u?.email || u?.username || 'officer@cybersentinel.gov'}</p>
        </div>
      </section>

      <section className="panel preferences" style={{ marginTop: '20px' }}>
        <p className="eyebrow">INTERFACE THEME</p>
        <h2>Visual Appearance</h2>
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`btn ${theme === 'dark' ? 'primary' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: theme === 'dark' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: theme === 'dark' ? 'var(--accent-soft)' : 'var(--surface-muted)',
              color: theme === 'dark' ? 'var(--accent-bright)' : 'var(--text-muted)',
              padding: '10px 18px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Moon size={16} /> Cyber Dark (Default)
          </button>
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`btn ${theme === 'light' ? 'primary' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: theme === 'light' ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: theme === 'light' ? 'var(--accent-soft)' : 'var(--surface-muted)',
              color: theme === 'light' ? 'var(--accent)' : 'var(--text-muted)',
              padding: '10px 18px',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Sun size={16} /> Crisp Light
          </button>
        </div>
      </section>

      <section className="panel preferences" style={{ marginTop: '20px' }}>
        <p className="eyebrow">NOTIFICATION PREFERENCES</p>
        <h2>Response settings</h2>
        <label>
          <input type="checkbox" defaultChecked /> Receive critical alert notifications
        </label>
        <label>
          <input type="checkbox" defaultChecked /> Include predicted time windows in summaries
        </label>
      </section>
    </div>
  );
}

