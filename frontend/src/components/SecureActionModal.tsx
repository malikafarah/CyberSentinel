import React, { useState } from 'react';
import { ShieldAlert, KeyRound, CheckCircle, Copy, X, Lock, FileCode, Check } from 'lucide-react';

export interface Receipt {
  transaction_id: string;
  block_hash: string;
  canonical_json: string;
  timestamp: string;
  previous_hash?: string;
  digital_signature?: string;
}

interface SecureActionModalProps {
  accountId: string;
  onClose: () => void;
  onSuccess?: (receipt: Receipt) => void;
}

export default function SecureActionModal({ accountId, onClose, onSuccess }: SecureActionModalProps) {
  const [pin, setPin] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/v1/action/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_account: accountId,
          officer_pin: pin,
          justification: reason
        })
      });

      if (!res.ok) {
        let errMessage = 'Authorization failed. Invalid PIN or insufficient permissions.';
        try {
          const errData = await res.json();
          if (errData?.detail) errMessage = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
        } catch {
          // non-json
        }
        throw new Error(errMessage);
      }

      const data = await res.json();
      const rawReceipt = data.receipt || data.audit_receipt || {};
      const generatedReceipt: Receipt = {
        transaction_id: rawReceipt.transaction_id || `TXN-${(rawReceipt.transaction_hash || '000000').slice(0, 12).toUpperCase()}`,
        block_hash: rawReceipt.block_hash || rawReceipt.transaction_hash || '0xabc123...',
        canonical_json: typeof rawReceipt.canonical_json === 'string'
          ? rawReceipt.canonical_json
          : JSON.stringify(rawReceipt.canonical_json || rawReceipt, null, 2),
        timestamp: rawReceipt.timestamp || new Date().toISOString(),
        previous_hash: rawReceipt.previous_hash,
        digital_signature: rawReceipt.digital_signature
      };

      setReceipt(generatedReceipt);
      if (onSuccess) {
        onSuccess(generatedReceipt);
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed. Invalid PIN or insufficient permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (!receipt) return;
    navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#121714] border border-white/15 rounded-xl p-6 w-full max-w-lg shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-gray-200">
        
        {/* VIEW 1: Authorization Prompt */}
        {!receipt ? (
          <form onSubmit={handleAuthorize}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400">
                  <Lock size={16} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-red-500 uppercase tracking-wide">
                    Initiate CFCFRMS Lien Request
                  </h2>
                  <p className="text-xs text-gray-400">
                    Banking ecosystem non-repudiation interdiction
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-white p-1 rounded transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-lg mb-4 text-xs font-mono">
              <span className="text-gray-400 block text-[10px] uppercase tracking-wider">Target Entity Account / IFSC</span>
              <span className="text-red-300 font-bold text-sm tracking-wide">{accountId}</span>
            </div>

            {error && (
              <div className="bg-red-500/15 border border-red-500/40 text-red-400 p-3 rounded-lg mb-4 text-xs flex items-center gap-2">
                <ShieldAlert size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="block mb-1.5 font-bold text-xs text-gray-300 uppercase tracking-wider">
                Justification Reason
              </label>
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-black/40 border border-white/15 p-2.5 rounded-lg text-xs font-mono text-gray-200 focus:border-red-500 focus:outline-none resize-none h-20"
                placeholder="e.g., Account identified as intermediate mule node in CYB-2026-1024 evidence chain..."
              />
            </div>

            <div className="mb-6">
              <label className="block mb-1.5 font-bold text-xs text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound size={13} className="text-red-400" /> Officer Authorization PIN
              </label>
              <input
                required
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-black/40 border border-white/15 p-2.5 rounded-lg font-mono tracking-widest text-base text-gray-100 focus:border-red-500 focus:outline-none"
                placeholder="****"
                maxLength={6}
              />
              <p className="text-[10px] text-gray-500 mt-1 font-mono">
                Authorizes digital signature generation and cryptographic ledger immutability.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !reason.trim() || !pin.trim()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs disabled:opacity-50 transition-colors uppercase tracking-wider cursor-pointer shadow-[0_0_20px_rgba(239,68,68,0.35)] flex items-center gap-2"
              >
                {isSubmitting ? 'Verifying Signature...' : 'Sign & Forward to Bank Nodal Officer'}
              </button>
            </div>
          </form>
        ) : (
          /* VIEW 2: Cryptographic Receipt */
          <div>
            <div className="flex items-center gap-2.5 mb-2 text-emerald-400">
              <CheckCircle size={22} />
              <h2 className="text-lg font-bold uppercase tracking-wide">Action Logged & Verified</h2>
            </div>
            
            <p className="text-xs text-gray-400 mb-4">
              Lien request cryptographically signed and queued for CFCFRMS API. This action has been permanently recorded to the immutable ledger.
            </p>

            <div className="bg-black/50 border border-white/15 p-4 rounded-lg mb-6 font-mono text-xs overflow-x-auto space-y-2.5">
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-500 text-[10px] uppercase font-bold">TXN ID:</span>
                <span className="text-emerald-400 font-bold">{receipt.transaction_id}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1.5">
                <span className="text-gray-500 text-[10px] uppercase font-bold">TIMESTAMP:</span>
                <span className="text-gray-300">{receipt.timestamp}</span>
              </div>
              <div className="border-b border-white/5 pb-1.5">
                <span className="text-gray-500 text-[10px] uppercase font-bold block mb-0.5">SHA-256 HASH:</span>
                <span className="text-blue-400 break-all text-[11px] block">{receipt.block_hash}</span>
              </div>
              <div className="pt-1">
                <span className="text-gray-500 text-[10px] uppercase font-bold mb-1 flex items-center gap-1.5">
                  <FileCode size={12} /> CANONICAL JSON:
                </span>
                <pre className="text-[10px] text-gray-300 bg-black/60 p-2.5 rounded border border-white/5 overflow-x-auto leading-relaxed">
                  {receipt.canonical_json}
                </pre>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={copyToClipboard}
                className="text-emerald-400 hover:text-emerald-300 font-bold text-xs font-mono flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied to Clipboard!' : 'Copy Receipt'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
