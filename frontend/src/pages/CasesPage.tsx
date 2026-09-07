import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Plus, Search, Filter, ShieldAlert, GitGraph, FileText, ChevronRight, X } from 'lucide-react';
import { caseService } from '../services/caseService';
import { Loading, PageHeader, RiskBadge, StatusBadge, ErrorState, Empty } from '../components/ui';
import type { Case, RiskLevel } from '../types';

export default function CasesPage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const fetchCases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await caseService.getCases();
      setCases(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch investigation cases');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleCreateCase = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.currentTarget);
      const title = String(formData.get('title') || '').trim();
      const customId = String(formData.get('id') || '').trim();
      const riskLevel = String(formData.get('risk_level') || 'HIGH');
      const summary = String(formData.get('summary') || '').trim() || title;

      await caseService.createCase({
        id: customId || undefined,
        title,
        summary,
        risk_level: riskLevel,
        status: 'ACTIVE',
      });

      setIsModalOpen(false);
      await fetchCases();
    } catch (err: any) {
      alert(`Failed to create case: ${err?.message || 'Server error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      !searchQuery ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.title && c.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      c.summary.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRisk = !filterRisk || c.risk_level.toUpperCase() === filterRisk.toUpperCase();
    const matchesStatus = !filterStatus || c.status.toUpperCase() === filterStatus.toUpperCase();

    return matchesSearch && matchesRisk && matchesStatus;
  });

  return (
    <div className="page">
      <PageHeader eyebrow="CASE & WORKSPACE DIRECTORY" title="Investigation Cases">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn secondary" onClick={fetchCases}>
            Refresh
          </button>
          <button className="btn" onClick={() => setIsModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> New Case
          </button>
        </div>
      </PageHeader>

      {/* Quick Summary KPIs */}
      <div className="kpis" style={{ marginBottom: '20px' }}>
        <article className="kpi">
          <BriefcaseBusiness />
          <p>Total Cases</p>
          <strong>{cases.length}</strong>
          <small>Active & closed operations</small>
        </article>
        <article className="kpi">
          <ShieldAlert />
          <p>Critical Threats</p>
          <strong>{cases.filter((c) => c.risk_level === 'CRITICAL').length}</strong>
          <small>Immediate interdiction needed</small>
        </article>
        <article className="kpi">
          <FileText />
          <p>Linked Incidents</p>
          <strong>{cases.reduce((acc, c) => acc + (c.complaints?.length || 0), 0)}</strong>
          <small>Associated NCRP complaints</small>
        </article>
        <article className="kpi">
          <GitGraph />
          <p>Targeted Corridors</p>
          <strong>{cases.reduce((acc, c) => acc + (c.hotspot_ids?.length || 0), 0)}</strong>
          <small>High risk banking terminals</small>
        </article>
      </div>

      {/* Filter & Search Bar */}
      <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            type="text"
            placeholder="Search by Case ID, title, or summary..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              fontSize: '12px',
            }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
          <Filter size={14} color="var(--accent)" />
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
            <option value="">All Risk Levels</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </label>

        {(searchQuery || filterRisk || filterStatus) && (
          <button
            className="link-btn"
            onClick={() => {
              setSearchQuery('');
              setFilterRisk('');
              setFilterStatus('');
            }}
            style={{ fontSize: '11px' }}
          >
            Reset
          </button>
        )}
      </div>

      {/* Case Directory Cards Grid */}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState>{error}</ErrorState>
      ) : filteredCases.length === 0 ? (
        <Empty>No investigation cases found matching the criteria.</Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredCases.map((c) => (
            <div
              key={c.id}
              className="panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '20px',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/cases/${c.id}`)}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.5px' }}>
                      #{c.id}
                    </span>
                    <h3 style={{ margin: '4px 0 0', fontSize: '16px', fontWeight: 700, color: '#F1F3F1' }}>
                      {c.title || c.summary}
                    </h3>
                  </div>
                  <RiskBadge level={c.risk_level as RiskLevel} />
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 16px', minHeight: '36px' }}>
                  {c.summary}
                </p>

                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-subtle)', marginBottom: '16px', borderTop: '1px solid var(--subtle-border)', paddingTop: '12px' }}>
                  <div>
                    <span>Status:</span> <StatusBadge status={c.status as any} />
                  </div>
                  <div>
                    <span>Complaints:</span> <b style={{ color: '#F1F3F1', fontFamily: 'JetBrains Mono' }}>{c.complaints?.length || 0}</b>
                  </div>
                  <div>
                    <span>Hotspots:</span> <b style={{ color: '#F1F3F1', fontFamily: 'JetBrains Mono' }}>{c.hotspot_ids?.length || 0}</b>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--subtle-border)', paddingTop: '12px' }} onClick={(e) => e.stopPropagation()}>
                <Link
                  to={`/cases/${c.id}/graph`}
                  className="btn small secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  <GitGraph size={13} color="var(--accent)" /> Money Trail Graph
                </Link>
                <Link
                  to={`/cases/${c.id}`}
                  className="link-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                >
                  Open Workspace <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create New Case Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal" style={{ maxWidth: '480px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <p className="eyebrow">OPERATIONAL DISPATCH</p>
                <h2 style={{ margin: 0, fontSize: '20px' }}>Create New Case</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCase}>
              <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', fontSize: '12px', fontWeight: 600 }}>
                Case ID (Optional)
                <input
                  name="id"
                  placeholder="e.g. CYB-2026-1045 (Auto-generated if empty)"
                  style={{
                    padding: '10px',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', fontSize: '12px', fontWeight: 600 }}>
                Case Title / Headline
                <input
                  name="title"
                  placeholder="e.g. Multi-Hop UPI Money Laundering Corridor"
                  required
                  style={{
                    padding: '10px',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: '6px', marginBottom: '14px', fontSize: '12px', fontWeight: 600 }}>
                Threat Severity
                <select
                  name="risk_level"
                  defaultValue="HIGH"
                  style={{
                    padding: '10px',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="CRITICAL">Critical Severity</option>
                  <option value="HIGH">High Severity</option>
                  <option value="MEDIUM">Medium Severity</option>
                  <option value="LOW">Low Severity</option>
                </select>
              </label>

              <label style={{ display: 'grid', gap: '6px', marginBottom: '18px', fontSize: '12px', fontWeight: 600 }}>
                Operational Summary / Intelligence Details
                <textarea
                  name="summary"
                  placeholder="Detailed context regarding affected victims, suspect accounts, or cash-out terminals..."
                  rows={3}
                  style={{
                    padding: '10px',
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontFamily: 'sans-serif',
                    resize: 'vertical',
                  }}
                />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? 'Creating Case...' : 'Create Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
