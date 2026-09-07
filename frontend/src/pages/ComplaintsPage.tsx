import { useState, useEffect } from 'react';
import { ShieldAlert, Filter, Search, FileText, Banknote, MapPin, Eye, Cpu } from 'lucide-react';
import { complaintService } from '../services/complaintService';
import ComplaintDetailModal from '../components/ComplaintDetailModal';
import NcrpIntake from '../components/NcrpIntake';
import { Loading, PageHeader, ErrorState, Empty } from '../components/ui';
import type { Complaint } from '../types';

export default function ComplaintsPage() {
  const [activeTab, setActiveTab] = useState<'registry' | 'intake'>('registry');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComplaints = () => {
    setLoading(true);
    setError(null);
    complaintService
      .getComplaints(region || undefined, category || undefined)
      .then((data) => {
        setComplaints(data);
      })
      .catch((err) => {
        console.error('Failed to fetch complaints:', err);
        setError(err?.message || 'Failed to load complaints from backend');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === 'registry') {
      fetchComplaints();
    }
  }, [region, category, activeTab]);

  const filteredComplaints = complaints.filter((c) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.id.toLowerCase().includes(query) ||
      (c.complaint_id && c.complaint_id.toLowerCase().includes(query)) ||
      c.crime_category.toLowerCase().includes(query) ||
      c.region.toLowerCase().includes(query) ||
      (c.account_number && c.account_number.toLowerCase().includes(query))
    );
  });

  const totalAmount = filteredComplaints.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  return (
    <div className="page">
      <PageHeader eyebrow="NCRP INCIDENT REGISTRY" title="Complaints & Intake">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'registry' ? '' : 'secondary'}`}
            onClick={() => setActiveTab('registry')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={15} /> Incident Directory ({complaints.length})
          </button>
          <button
            className={`btn ${activeTab === 'intake' ? '' : 'secondary'}`}
            onClick={() => setActiveTab('intake')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Cpu size={15} /> NCRP NLP Intake
          </button>
          {activeTab === 'registry' && (
            <button className="btn secondary" onClick={fetchComplaints}>
              Refresh
            </button>
          )}
        </div>
      </PageHeader>

      {activeTab === 'intake' ? (
        <NcrpIntake />
      ) : (
        <>
          {/* KPI Stats Summary */}
          <div className="kpis" style={{ marginBottom: '20px' }}>
            <article className="kpi">
              <FileText />
              <p>Total Complaints</p>
              <strong>{complaints.length}</strong>
              <small>Validated incidents on record</small>
            </article>
            <article className="kpi">
              <Banknote />
              <p>Reported Loss Value</p>
              <strong>₹{totalAmount.toLocaleString('en-IN')}</strong>
              <small>Disputed financial fraud sum</small>
            </article>
            <article className="kpi">
              <MapPin />
              <p>Active Regions</p>
              <strong>{new Set(complaints.map((c) => c.region)).size}</strong>
              <small>Geographic jurisdictions</small>
            </article>
            <article className="kpi">
              <ShieldAlert />
              <p>Categories Monitored</p>
              <strong>{new Set(complaints.map((c) => c.crime_category)).size}</strong>
              <small>Crime vectors classified</small>
            </article>
          </div>

          {/* Filters Toolbar */}
          <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                placeholder="Search by Complaint ID, account, category..."
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
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">All Regions</option>
                <option value="Vijayawada">Vijayawada</option>
                <option value="Hyderabad">Hyderabad</option>
                <option value="North">North Corridor</option>
                <option value="South">South Corridor</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <ShieldAlert size={14} color="var(--accent)" />
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All Categories</option>
                <option value="Financial Cyber Fraud">Financial Cyber Fraud</option>
                <option value="ATM Skimming">ATM Skimming</option>
                <option value="Account Takeover">Account Takeover</option>
                <option value="Phishing">Phishing</option>
                <option value="Mule Account">Mule Account</option>
              </select>
            </label>

            {(region || category || searchQuery) && (
              <button
                className="link-btn"
                onClick={() => {
                  setRegion('');
                  setCategory('');
                  setSearchQuery('');
                }}
                style={{ fontSize: '11px' }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Complaints Data Table */}
          <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <Loading />
            ) : error ? (
              <ErrorState>{error}</ErrorState>
            ) : filteredComplaints.length === 0 ? (
              <Empty>No complaints found matching the selected filters.</Empty>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-strong)', color: 'var(--text-subtle)', font: '700 10px JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                      <th style={{ padding: '14px 16px' }}>Complaint ID</th>
                      <th style={{ padding: '14px 16px' }}>Date / Time</th>
                      <th style={{ padding: '14px 16px' }}>Crime Vector</th>
                      <th style={{ padding: '14px 16px' }}>Region</th>
                      <th style={{ padding: '14px 16px' }}>Account</th>
                      <th style={{ padding: '14px 16px' }}>Loss Amount</th>
                      <th style={{ padding: '14px 16px', textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComplaints.map((c) => (
                      <tr
                        key={c.id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          transition: 'background 0.15s ease',
                        }}
                        className="hover-row"
                      >
                        <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--accent)' }}>
                          {c.complaint_id || c.id}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          {new Date(c.timestamp).toLocaleDateString()} <small style={{ color: 'var(--text-subtle)' }}>{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#F1F3F1' }}>
                          {c.crime_category}
                        </td>
                        <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={11} color="var(--accent)" /> {c.region}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono', color: 'var(--text-muted)' }}>
                          {c.account_number || '—'}
                        </td>
                        <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#F1F3F1' }}>
                          ₹{Number(c.amount).toLocaleString('en-IN')}
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => setSelectedComplaintId(c.complaint_id || c.id)}
                            className="btn small secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Eye size={12} /> View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Detail Modal */}
          {selectedComplaintId && (
            <ComplaintDetailModal
              complaintId={selectedComplaintId}
              onClose={() => setSelectedComplaintId(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
