import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { PageHeader, Loading, ErrorState } from '../components/ui';
import { Radio, Shield, Smartphone, AlertTriangle } from 'lucide-react';

interface FusionSignal {
  identifier: string;
  source: string;
  input_risk: number;
  resulting_risk: number;
  target_node_id: string;
  reason: string;
  timestamp: string;
}

const SOURCE_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  NPCI_eFRM: { icon: <Shield size={14} />, color: 'text-blue-400 border-blue-500/40 bg-blue-500/10', label: 'NPCI eFRM' },
  DoT_Chakshu: { icon: <Smartphone size={14} />, color: 'text-purple-400 border-purple-500/40 bg-purple-500/10', label: 'DoT Chakshu' },
  NCRP: { icon: <AlertTriangle size={14} />, color: 'text-amber-400 border-amber-500/40 bg-amber-500/10', label: 'NCRP 1930' },
};

export function ThreatFusion() {
  const [signals, setSignals] = useState<FusionSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.get<{ signals: FusionSignal[] }>('/fusion/signals');
      setSignals(data.signals || []);
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Failed to load fusion signals.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="page"><PageHeader eyebrow="NATIONAL SIGNAL FUSION" title="Threat Fusion" /><ErrorState>{error}</ErrorState></div>;

  return (
    <div className="page">
      <PageHeader eyebrow="NATIONAL SIGNAL FUSION" title="Multi-Agency Threat Intelligence">
        <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1.5 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 rounded-full">
          <Radio size={11} className="animate-pulse" /> Live Feed
        </span>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {Object.entries(SOURCE_META).map(([key, meta]) => {
          const count = signals.filter(s => s.source === key || s.source.includes(key.split('_')[0])).length;
          return (
            <div key={key} className={`panel flex items-center gap-3 border rounded-lg p-4 ${meta.color}`}>
              {meta.icon}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider">{meta.label}</div>
                <div className="text-2xl font-mono font-bold">{count}</div>
                <div className="text-[10px] opacity-70">signals ingested</div>
              </div>
            </div>
          );
        })}
      </div>

      <section className="panel table-panel">
        <p className="eyebrow">REAL-TIME FUSION LOG</p>
        <h2>National Agency Signals</h2>
        {signals.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <Radio size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No fusion signals yet. Use the Simulate Traffic feature or POST to /fusion/ingest-signal to see live data.</p>
          </div>
        ) : (
          <div className="space-y-2 mt-4">
            {signals.map((sig, idx) => {
              const meta = SOURCE_META[sig.source] || SOURCE_META['NCRP'];
              return (
                <article key={idx} className="flex items-center gap-4 p-3 rounded-lg bg-white/[0.02] border border-white/10 hover:border-white/20 transition-colors">
                  <div className={`flex items-center gap-2 px-2 py-1 rounded border text-xs font-bold font-mono ${meta?.color || 'text-gray-400 border-gray-500/40 bg-gray-500/10'}`}>
                    {meta?.icon}
                    <span>{sig.source}</span>
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="text-xs font-semibold text-white truncate">{sig.identifier}</div>
                    <div className="text-[10px] text-gray-500 truncate">{sig.reason}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[9px] text-gray-500 uppercase">Risk Delta</div>
                    <div className="text-sm font-mono font-bold text-red-400">
                      {sig.input_risk.toFixed(0)} → {sig.resulting_risk.toFixed(0)}
                    </div>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono text-right whitespace-nowrap">
                    {new Date(sig.timestamp).toLocaleTimeString('en-IN')}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default ThreatFusion;
