import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Zap, Activity, Play, Square, ChevronDown } from 'lucide-react';
import { api } from '../services/api';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SimulatedTransaction {
  tx_hash: string;
  pattern: string;
  pattern_description: string;
  victim_label: string;
  mule_label: string;
  atm_label: string;
  amount_inr: number;
  fraud_probability: number;
  timestamp: string;
}

interface TrafficSimulatorProps {
  onClose: () => void;
}

const PATTERNS = [
  {
    key: 'mule_layering',
    label: 'Mule Layering',
    description: 'Rapid layering through multiple mule accounts',
    colour: '#F59E0B',
  },
  {
    key: 'atm_cashout',
    label: 'ATM Cash-Out',
    description: 'Coordinated ATM cash-out from mule terminals',
    colour: '#EF4444',
  },
  {
    key: 'rapid_bustout',
    label: 'Rapid Bust-Out',
    description: 'High-value rapid bust-out via multiple mules',
    colour: '#F97316',
  },
] as const;

const INTERVALS = [
  { label: 'Manual', value: 0 },
  { label: '1 s', value: 1000 },
  { label: '3 s', value: 3000 },
  { label: '5 s', value: 5000 },
] as const;

function formatINR(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function riskColour(p: number) {
  if (p >= 0.95) return '#EF4444';
  if (p >= 0.88) return '#F97316';
  if (p >= 0.80) return '#F59E0B';
  return '#10B981';
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TrafficSimulator({ onClose }: TrafficSimulatorProps) {
  const [pattern, setPattern] = useState<string>('mule_layering');
  const [count, setCount] = useState(1);
  const [interval, setInterval_] = useState(0);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<SimulatedTransaction[]>([]);
  const [totalInjected, setTotalInjected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);

  // Scroll ledger to top on new entries
  useEffect(() => {
    if (ledgerRef.current) ledgerRef.current.scrollTop = 0;
  }, [log]);

  const injectTransactions = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ transactions: SimulatedTransaction[] }>(
        '/engine/simulate-traffic',
        { count, pattern }
      );
      const txs = res.transactions ?? [];
      setLog(prev => [...txs, ...prev].slice(0, 120));
      setTotalInjected(prev => prev + txs.length);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setRunning(false);
    } finally {
      setBusy(false);
    }
  }, [busy, count, pattern]);

  // Continuous mode loop
  useEffect(() => {
    if (!running || interval === 0) return;
    timerRef.current = setTimeout(async () => {
      await injectTransactions();
    }, interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [running, interval, injectTransactions, log]);

  const handleToggle = async () => {
    if (running) {
      setRunning(false);
      if (timerRef.current) clearTimeout(timerRef.current);
    } else {
      setRunning(true);
      await injectTransactions();
    }
  };

  const handleManualFire = async () => {
    await injectTransactions();
  };

  const selectedPat = PATTERNS.find(p => p.key === pattern) ?? PATTERNS[0];

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal"
        style={{
          maxWidth: 560,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* ── Header ─── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={18} color="var(--success)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.2px' }}>Live Traffic Simulator</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.1em', marginTop: 1 }}>
                SYNTHETIC FRAUD TELEMETRY INJECTION
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ border: 0, background: 'none', color: 'var(--text-muted)', padding: 4, borderRadius: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Controls ─── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'grid',
          gap: 14,
        }}>
          {/* Pattern selector */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Attack Pattern
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {PATTERNS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPattern(p.key)}
                  style={{
                    border: `1px solid ${pattern === p.key ? p.colour + '44' : 'var(--border)'}`,
                    background: pattern === p.key ? p.colour + '14' : 'var(--surface-muted)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, color: pattern === p.key ? p.colour : 'var(--text-primary)', marginBottom: 2 }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 9.5, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Count + Interval controls */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Transactions per Burst
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {[1, 3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    style={{
                      border: `1px solid ${count === n ? 'var(--accent)' : 'var(--border)'}`,
                      background: count === n ? 'var(--accent-soft)' : 'var(--surface-muted)',
                      color: count === n ? 'var(--accent-bright)' : 'var(--text-muted)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Continuous Interval
              </div>
              <div style={{ position: 'relative' }}>
                <select
                  value={interval}
                  onChange={e => { setInterval_(Number(e.target.value)); if (running) setRunning(false); }}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-muted)',
                    color: 'var(--text-primary)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '7px 28px 7px 10px',
                    fontSize: 12,
                    appearance: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {INTERVALS.map(i => (
                    <option key={i.value} value={i.value}>{i.label}</option>
                  ))}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8 }}>
            {interval === 0 ? (
              <button
                className="btn"
                onClick={handleManualFire}
                disabled={busy}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                <Zap size={14} />
                {busy ? 'Injecting…' : `Inject ${count} Transaction${count > 1 ? 's' : ''}`}
              </button>
            ) : (
              <button
                className={`btn ${running ? 'danger' : 'success'}`}
                onClick={handleToggle}
                disabled={busy && !running}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {running ? <><Square size={14} /> Stop Simulation</> : <><Play size={14} /> Start Continuous</>}
              </button>
            )}
          </div>

          {error && (
            <div className="toast error" style={{ marginBottom: 0 }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Stats strip ─── */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 24,
          background: 'var(--surface-muted)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Injected</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: totalInjected > 0 ? 'var(--success)' : 'var(--text-muted)', lineHeight: 1.2, marginTop: 2 }}>{totalInjected}</div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pattern</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: selectedPat.colour, marginTop: 4 }}>{selectedPat.label}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {running && (
              <>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', animation: 'live-pulse 2.4s ease-in-out infinite', display: 'inline-block' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--success)', letterSpacing: '0.1em' }}>RUNNING</span>
              </>
            )}
          </div>
        </div>

        {/* ── Telemetry ledger ─── */}
        <div
          ref={ledgerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 20px',
            display: 'grid',
            alignContent: 'start',
            gap: 6,
          }}
        >
          {log.length === 0 ? (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: 120, color: 'var(--text-dim)', fontSize: 13, gap: 6 }}>
              <Activity size={28} color="var(--text-dim)" />
              <span>No transactions yet — inject to begin</span>
            </div>
          ) : log.map(tx => (
            <div
              key={tx.tx_hash}
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                display: 'grid',
                gap: 4,
                animation: 'slide-down 0.18s ease-out',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                  TX {tx.tx_hash}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: riskColour(tx.fraud_probability) + '20',
                    border: `1px solid ${riskColour(tx.fraud_probability)}44`,
                    color: riskColour(tx.fraud_probability),
                    letterSpacing: '0.06em',
                  }}
                >
                  {(tx.fraud_probability * 100).toFixed(1)}% FRAUD
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, marginTop: 2 }}>
                <span style={{ color: 'var(--text-muted)' }}>{tx.victim_label}</span>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <span style={{ color: 'var(--text-muted)' }}>{tx.mule_label}</span>
                {tx.atm_label && (
                  <>
                    <span style={{ color: 'var(--text-dim)' }}>→</span>
                    <span style={{ color: 'var(--text-muted)' }}>{tx.atm_label}</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                  {formatINR(tx.amount_inr)}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--text-dim)' }}>
                  {new Date(tx.timestamp).toLocaleTimeString('en-IN', { hour12: false })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
