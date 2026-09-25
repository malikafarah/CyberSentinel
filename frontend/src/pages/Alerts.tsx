import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { alertService, predictionService } from '../services/services';
import type { Alert, Prediction } from '../types';
import { ConfirmModal, Empty, Loading, PageHeader, RiskBadge, ErrorState } from '../components/ui';

const tabs = ['All', 'Critical', 'High', 'Medium', 'Unacknowledged', 'Acknowledged'];

export function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [p, setP] = useState<Prediction[]>([]);
  const [tab, setTab] = useState('All');
  const [target, setTarget] = useState<string>();
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newAlertsCount, setNewAlertsCount] = useState(0);
  const nav = useNavigate();

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const [alertList, predList] = await Promise.all([
        alertService.list(),
        predictionService.list(),
      ]);
      
      if (silent) {
        // Compute newly arrived alerts that aren't in current state
        setAlerts(prev => {
          const newOnes = alertList.filter(a => !prev.find(old => old.id === a.id));
          if (newOnes.length > 0) {
            setNewAlertsCount(count => count + newOnes.length);
          }
          return alertList;
        });
      } else {
        setAlerts(alertList);
      }
      setP(predList);
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Failed to load alerts from server.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 45000);
    return () => clearInterval(interval);
  }, []);

  // Reset new alerts counter when changing tabs
  useEffect(() => {
    setNewAlertsCount(0);
  }, [tab]);

  if (loading) return <Loading />;
  if (error) {
    return (
      <div className="page">
        <PageHeader eyebrow="OPERATIONAL RESPONSE" title="Alerts queue" />
        <ErrorState>{error}</ErrorState>
      </div>
    );
  }

  const shown = alerts.filter((a) => {
    if (tab === 'All') return true;
    if (tab === 'Unacknowledged') return a.status === 'NEW' || a.status === 'ACTIVE';
    if (tab === 'Acknowledged') return a.status === 'ACKNOWLEDGED';
    return a.severity === tab.toUpperCase();
  });

  const ack = async () => {
    if (target) {
      await alertService.acknowledge(target);
      setAlerts((prev) =>
        prev.map((al) => (al.id === target ? { ...al, status: 'ACKNOWLEDGED' } : al))
      );
      setTarget(undefined);
      setToast('Alert acknowledged and response queue updated.');
      setTimeout(() => setToast(''), 3000);
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="OPERATIONAL RESPONSE" title="Alerts queue">
        {newAlertsCount > 0 && (
          <span className="ml-2 px-2.5 py-1 bg-red-500/20 border border-red-500/50 text-red-400 text-[10px] font-mono font-bold rounded-full animate-pulse uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
            {newAlertsCount} New
          </span>
        )}
      </PageHeader>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
      <section className="panel table-panel">
        <div className="alert-table-wrap">
          {/* Sticky Header Row */}
          <div className="alert-table-header">
            <div>Source Entity</div>
            <div>Risk Score</div>
            <div>Forecast</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
          </div>

          {shown.length ? (
            <div className="flex flex-col">
              {shown.map((a) => {
                const x = p.find(
                  (z) =>
                    z.id === a.prediction_id ||
                    z.id === `p_${a.prediction_id}` ||
                    (z as any).location_id === a.prediction_id
                );

                // Robust Risk Score Resolution
                let rawScore: number | undefined;
                if (x?.risk_score !== undefined && x?.risk_score !== null) rawScore = Number(x.risk_score);
                else if ((x as any)?.riskScore !== undefined) rawScore = Number((x as any).riskScore);
                else if (a.riskScore !== undefined) rawScore = Number(a.riskScore);
                else if (a.risk_score !== undefined) rawScore = Number(a.risk_score);

                if (rawScore === undefined || isNaN(rawScore)) {
                  if (a.severity === 'CRITICAL') rawScore = 95.0;
                  else if (a.severity === 'HIGH') rawScore = 78.0;
                  else if (a.severity === 'MEDIUM') rawScore = 55.0;
                  else rawScore = 30.0;
                }

                if (rawScore > 0 && rawScore <= 1.0) {
                  rawScore = rawScore * 100;
                }

                const formattedScore = rawScore.toFixed(1);
                const scoreColor = rawScore >= 80 ? 'text-red-500' : rawScore >= 70 ? 'text-orange-400' : rawScore >= 50 ? 'text-yellow-400' : 'text-emerald-400';

                return (
                  <article className="alert-row group" key={a.id}>
                    {/* Source Column */}
                    <div className="flex items-center gap-3 min-w-0">
                      <RiskBadge level={a.severity} />
                      <div className="alert-primary min-w-0">
                        <b className="truncate block text-slate-900 dark:text-gray-100">{x ? x.location_id : a.prediction_id}</b>
                        <span className="truncate block text-slate-500 dark:text-gray-500 text-xs">
                          {x ? `${x.location_name} · ${x.region}` : `Alert ID: ${a.id}`}
                        </span>
                      </div>
                    </div>

                    {/* Risk Score Column */}
                    <div className={`font-mono font-medium ${scoreColor}`}>
                      {formattedScore}%
                    </div>

                    {/* Forecast Column */}
                    <div className="font-mono text-sm text-slate-800 dark:text-gray-300">
                      {x ? x.predicted_window : 'Active'}
                    </div>

                    {/* Status Column - Minimal glow dot / muted text */}
                    <div className="flex items-center gap-2">
                      {a.status === 'NEW' || a.status === 'ACTIVE' ? (
                        <>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tracking-wider">NEW</span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-600" />
                          <span className="text-xs font-medium text-slate-500 dark:text-gray-400 tracking-wider">ACKNOWLEDGED</span>
                        </>
                      )}
                    </div>

                    {/* Actions Column - Standardized subtle text actions + ghost acknowledge button */}
                    <div className="flex items-center justify-end gap-2">
                      {x && (
                        <button
                          className="px-2 py-1 text-slate-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 rounded border border-transparent hover:border-emerald-500/20 transition-all text-xs font-medium cursor-pointer"
                          onClick={() => nav(`/predictions/${x.id}`)}
                          title={`View Prediction Details (${x.id})`}
                        >
                          Prediction
                        </button>
                      )}
                      {x?.case_id && (
                        <button
                          className="px-2 py-1 text-slate-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-500/10 rounded border border-transparent hover:border-emerald-500/20 transition-all text-xs font-medium cursor-pointer"
                          onClick={() => nav(`/investigations/${x.case_id}`)}
                          title={`View Investigation Case (${x.case_id})`}
                        >
                          Case
                        </button>
                      )}
                      {(a.status === 'NEW' || a.status === 'ACTIVE') ? (
                        <button
                          className="px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/15 hover:border-emerald-500/60 rounded flex items-center gap-1.5 transition-all shadow-[0_0_10px_rgba(16,185,129,0.08)] cursor-pointer"
                          onClick={() => setTarget(a.id)}
                          title="Acknowledge Alert"
                        >
                          <Check size={13} />
                          <span>Acknowledge</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 dark:text-gray-600 px-2 py-1 font-mono">Archived</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-8">
              <Empty>No alerts match the selected operational filter.</Empty>
            </div>
          )}
        </div>
      </section>
      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(undefined)}
        onConfirm={ack}
      />
    </div>
  );
}
