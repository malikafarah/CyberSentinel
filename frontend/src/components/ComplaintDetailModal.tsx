import { useEffect, useState } from 'react';
import { X, ShieldAlert, Calendar, MapPin, CreditCard, Banknote, User } from 'lucide-react';
import { complaintService } from '../services/complaintService';
import type { Complaint } from '../types';

interface Props {
  complaintId: string;
  onClose: () => void;
}

export default function ComplaintDetailModal({ complaintId, onClose }: Props) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    complaintService
      .getComplaintById(complaintId)
      .then((data) => setComplaint(data))
      .catch((err) => setError(err?.message || 'Failed to load complaint details'))
      .finally(() => setLoading(false));
  }, [complaintId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '520px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <p className="eyebrow">NCRP COMPLAINT RECORD</p>
            <h2 style={{ margin: 0, fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={20} color="var(--accent)" />
              Complaint #{complaintId}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--accent)', fontFamily: 'monospace', fontSize: '12px' }}>
            Retrieving validated complaint record...
          </div>
        ) : error || !complaint ? (
          <div style={{ padding: '20px', color: 'var(--danger)', fontSize: '13px', background: 'rgba(255,77,79,0.08)', borderRadius: '6px' }}>
            {error || 'Complaint record not found.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px', fontSize: '12px' }}>
            <div style={{ background: 'var(--surface-muted)', padding: '14px', borderRadius: '8px', border: '1px solid var(--subtle-border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldAlert size={12} /> Crime Category
                  </span>
                  <strong style={{ display: 'block', marginTop: '2px', color: '#F1F3F1' }}>{complaint.crime_category}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} /> Geographic Region
                  </span>
                  <strong style={{ display: 'block', marginTop: '2px', color: '#F1F3F1' }}>{complaint.region}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={12} /> Timestamp
                  </span>
                  <span style={{ display: 'block', marginTop: '2px', fontFamily: 'JetBrains Mono', color: '#A6ADA8' }}>
                    {new Date(complaint.timestamp).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Banknote size={12} /> Disputed Amount
                  </span>
                  <strong style={{ display: 'block', marginTop: '2px', color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: '14px' }}>
                    ₹{Number(complaint.amount).toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>

              {complaint.account_number && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--subtle-border)' }}>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CreditCard size={12} /> Affected Account Number
                  </span>
                  <span style={{ display: 'block', marginTop: '2px', fontFamily: 'JetBrains Mono', color: '#F1F3F1' }}>
                    {complaint.account_number}
                  </span>
                </div>
              )}

              {complaint.reported_by && (
                <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--subtle-border)' }}>
                  <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} /> Reported By / Source
                  </span>
                  <span style={{ display: 'block', marginTop: '2px', color: '#F1F3F1' }}>
                    {complaint.reported_by}
                  </span>
                </div>
              )}
            </div>

            {complaint.text && (
              <div style={{ background: 'var(--surface-muted)', padding: '12px', borderRadius: '8px', border: '1px solid var(--subtle-border)' }}>
                <span style={{ color: 'var(--text-subtle)', fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                  Raw NCRP Complaint Transcript
                </span>
                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: '1.5', fontStyle: 'italic' }}>
                  "{complaint.text}"
                </p>
              </div>
            )}
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
