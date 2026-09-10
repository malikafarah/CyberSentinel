import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { alertService, predictionService } from '../services/services';
import type { Alert, Prediction } from '../types';
import { ConfirmModal, Empty, Loading, PageHeader, RiskBadge, StatusBadge, ErrorState } from '../components/ui';

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
        {shown.length ? (
          shown.map((a) => {
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
              <article className="alert-row" key={a.id}>
                <RiskBadge level={a.severity} />
                <div className="alert-primary">
                  <b>{x ? x.location_id : a.prediction_id}</b>
                  <span>
                    {x ? `${x.location_name} · ${x.region}` : `Alert ID: ${a.id}`}
                  </span>
                </div>
                <div>
                  <small>Risk score</small>
                  <b className={`font-mono ${scoreColor}`}>{formattedScore}%</b>
                </div>
                <div>
                  <small>Forecast</small>
                  <b className="font-mono">{x ? x.predicted_window : 'Active'}</b>
                </div>
                <StatusBadge status={a.status} />
                <div className="row-actions">
                  {x && (
                    <button
                      className="link-btn"
                      onClick={() => nav(`/predictions/${x.id}`)}
                    >
                      Prediction
                    </button>
                  )}
                  {x?.case_id && (
                    <button
                      className="link-btn"
                      onClick={() => nav(`/investigations/${x.case_id}`)}
                    >
                      Case
                    </button>
                  )}
                  {(a.status === 'NEW' || a.status === 'ACTIVE') && (
                    <button
                      className="btn small"
                      onClick={() => setTarget(a.id)}
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <Empty>No alerts match the selected operational filter.</Empty>
        )}
      </section>
      <ConfirmModal
        open={!!target}
        onClose={() => setTarget(undefined)}
        onConfirm={ack}
      />
    </div>
  );
}
