import { useAuth } from '../context/AuthContext';
import { PageHeader } from '../components/ui';

export function Settings() {
  const { user: u } = useAuth();

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
      <section className="panel preferences">
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

