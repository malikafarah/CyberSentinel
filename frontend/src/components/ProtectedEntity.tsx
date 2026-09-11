import { useState } from 'react';
import { maskPII, type PIIType } from '../utils/privacy';
import { Eye, ShieldCheck } from 'lucide-react';

export interface ProtectedEntityProps {
  type: PIIType;
  value: string;
  entityId: string;
  className?: string;
  showIcon?: boolean;
}

export function ProtectedEntity({
  type,
  value,
  entityId,
  className = '',
  showIcon = true
}: ProtectedEntityProps) {
  const [isMasked, setIsMasked] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleUnmask = async () => {
    const reason = window.prompt("DPDP Act Compliance: Enter justification for unmasking PII:");
    if (reason && reason.trim()) {
      setLoading(true);
      try {
        // Send audit log to backend before revealing
        await fetch('/api/v1/audit/log-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityId,
            reason: reason.trim(),
            action: 'UNMASK_PII',
            pii_type: type
          })
        });
      } catch (err) {
        console.warn('Audit access logging failed or running offline:', err);
      } finally {
        setIsMasked(false);
        setLoading(false);
      }
    }
  };

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="font-mono bg-white/5 border border-white/10 text-gray-200 px-2 py-0.5 rounded text-xs tracking-wide">
        {isMasked ? maskPII(type, value) : value}
      </span>
      {isMasked ? (
        <button
          type="button"
          onClick={handleUnmask}
          disabled={loading}
          className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
          title="Unmask PII (Requires DPDP Act Justification)"
        >
          {showIcon && <Eye size={12} />}
          <span>{loading ? 'Logging...' : 'View'}</span>
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono" title="PII Unmasked under DPDP Compliance">
          <ShieldCheck size={12} />
          <span>Unmasked</span>
        </span>
      )}
    </div>
  );
}

export default ProtectedEntity;
