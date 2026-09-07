import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { caseService, predictionService } from '../services/services';
import type { Case, Prediction } from '../types';
import { ErrorState, PageHeader, RiskBadge, Loading } from '../components/ui';

export function Investigation() {
  const { id = '' } = useParams();
  const [c, setC] = useState<Case>();
  const [p, setP] = useState<Prediction[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nav = useNavigate();

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([caseService.get(id), predictionService.list()])
      .then(([caseData, predData]) => {
        if (!caseData) {
          setError(`Investigation record '${id}' could not be located.`);
        } else {
          setC(caseData);
        }
        setP(predData);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to fetch investigation details.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) return <Loading />;
  if (error || !c) {
    return (
      <div className="page">
        <PageHeader eyebrow="INVESTIGATION / CASE VIEW" title="Investigation" />
        <ErrorState>{error || 'Investigation record could not be located.'}</ErrorState>
      </div>
    );
  }

  const hot = p.filter((x) => c.hotspot_ids?.includes(x.id));

  const updateCaseStatus = async (newStatus: string) => {
    try {
      await caseService.updateCase(c.id, { status: newStatus });
      setC((prev) => prev ? { ...prev, status: newStatus } : undefined);
    } catch (err: any) {
      alert(`Failed to update case status: ${err?.message || 'Server error'}`);
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="INVESTIGATION / CASE VIEW" title={`CASE #${c.id}`}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={() => nav(`/cases/${c.id}/graph`)}>
            Interactive Money Trail Graph
          </button>
          <button className="btn secondary" onClick={() => nav('/cases')}>
            Back to Directory
          </button>
        </div>
      </PageHeader>

      <div className="case-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)', textTransform: 'uppercase', fontWeight: 700 }}>
              Status:
            </span>
            <select
              value={c.status}
              onChange={(e) => updateCaseStatus(e.target.value)}
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border-strong)',
                color: c.status === 'CLOSED' ? '#A6ADA8' : c.status === 'ACTIVE' ? 'var(--accent)' : '#FFD166',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                cursor: 'pointer',
              }}
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="PENDING">PENDING</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>
          <RiskBadge level={c.risk_level} />
        </div>
        <p style={{ marginTop: '12px' }}>{c.summary || c.title}</p>
      </div>

      <div className="case-grid">
        <section className="panel">
          <p className="eyebrow">RELATED COMPLAINTS</p>
          <h2>Case associations</h2>
          <div className="chips">
            {c.complaints?.map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
        </section>
        <section className="panel">
          <p className="eyebrow">PREDICTED HOTSPOTS</p>
          <h2>Priority locations</h2>
          {hot.length > 0 ? (
            hot.map((x) => (
              <button
                className="hotspot"
                key={x.id}
                onClick={() => nav(`/predictions/${x.id}`)}
              >
                <span>
                  <b>{x.location_id}</b>
                  <small>
                    {x.predicted_window} · {x.location_name}
                  </small>
                </span>
                <RiskBadge level={x.risk_level} />
              </button>
            ))
          ) : (
            <p className="help">No active predicted hotspots associated with this case.</p>
          )}
        </section>
        <section className="panel timeline">
          <p className="eyebrow">TRANSACTION / EVENT TIMELINE</p>
          <h2>Operational sequence</h2>
          {c.timeline?.map((x) => (
            <div key={x.time}>
              <time>{x.time}</time>
              <span />
              <p>
                <b>{x.event}</b>
                <small>{x.location}</small>
              </p>
            </div>
          ))}
        </section>
        <section className="panel notes">
          <p className="eyebrow">EVIDENCE & INTELLIGENCE NOTES</p>
          <h2>Officer notes</h2>
          {c.notes?.map((x) => (
            <p key={x}>• {x}</p>
          ))}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (note && c) {
                const updated = await caseService.addNote(c.id, note);
                if (updated) {
                  setC(updated);
                } else {
                  c.notes.push(note);
                  setC({ ...c });
                }
                setNote('');
              }
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add intelligence note"
            />
            <button className="btn small">Add note</button>
          </form>
        </section>
      </div>
    </div>
  );
}
