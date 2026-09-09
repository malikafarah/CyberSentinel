import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, MapPinned, MessageSquare, RefreshCw, ShieldAlert, Radio, Terminal } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Legend } from 'recharts';
import { dashboardService, predictionService, alertService, locationService } from '../services/services';
import type { Alert, DashboardSummary, Prediction, LocationItem } from '../types';
import { MapView } from '../components/MapView';
import MlPipelineConsole from '../components/MlPipelineConsole';
import { Loading, PageHeader, RiskBadge, StatusBadge, ErrorState } from '../components/ui';

const icon = [MessageSquare, MapPinned, AlertTriangle, Banknote];

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [p, setP] = useState<Prediction[]>([]);
  const [a, setA] = useState<Alert[]>([]);
  const [locs, setLocs] = useState<LocationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState(false);
  const nav = useNavigate();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryData, predictionData, alertData, locationsData] = await Promise.all([
        dashboardService.getSummary(),
        predictionService.list(),
        alertService.list(),
        locationService.list().catch(() => [] as LocationItem[]),
      ]);
      setSummary(summaryData);
      setP(predictionData);
      setA(alertData);
      setLocs(locationsData);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard intelligence from the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <Loading />;
  if (error || !summary) {
    return (
      <div className="page">
        <PageHeader eyebrow="OPERATIONAL OVERVIEW" title="Threat picture" />
        <ErrorState>
          {error || 'Unable to connect to live backend services.'}
          <div style={{ marginTop: '1rem' }}>
            <button className="btn secondary" onClick={loadData}>
              <RefreshCw size={16} /> Retry
            </button>
          </div>
        </ErrorState>
      </div>
    );
  }

  const cards = [
    ['Total Complaints', summary.totalComplaints, 'Validated & linked complaints'],
    ['High-Risk Zones', summary.highRiskZones, 'Critical and high priority'],
    ['Active Alerts', summary.activeAlerts, 'Awaiting operational action'],
    ['At-Risk ATMs', summary.atRiskAtms, 'Next 24-hour forecast'],
  ];

  // Format data for Recharts PieChart
  const breakdown = summary.risk_level_breakdown || {
    CRITICAL: p.filter((x) => x.risk_level === 'CRITICAL').length || 1,
    HIGH: p.filter((x) => x.risk_level === 'HIGH').length || 2,
    MEDIUM: p.filter((x) => x.risk_level === 'MEDIUM').length || 3,
    LOW: p.filter((x) => x.risk_level === 'LOW').length || 4,
  };

  const chartData = [
    { name: 'Critical', value: breakdown.CRITICAL ?? 0, color: '#ef4444' },
    { name: 'High', value: breakdown.HIGH ?? 0, color: '#f97316' },
    { name: 'Medium', value: breakdown.MEDIUM ?? 0, color: '#eab308' },
    { name: 'Low', value: breakdown.LOW ?? 0, color: '#22c55e' },
  ];

  const activeChartData = chartData.filter((item) => item.value > 0);
  const totalThreatEntities = chartData.reduce((acc, curr) => acc + curr.value, 0) || 1;

  return (
    <div className="page">
      <PageHeader eyebrow="OPERATIONAL OVERVIEW" title="Threat picture">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`btn ${showConsole ? '' : 'secondary'}`}
            onClick={() => setShowConsole((prev) => !prev)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Terminal size={14} /> {showConsole ? 'Close ML Console' : 'ML Pipeline Console'}
          </button>
          <button className="btn secondary" onClick={loadData}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn" onClick={() => nav('/heatmap')}>
            Open full GIS heatmap
          </button>
        </div>
      </PageHeader>

      {/* Live SSE ML Intelligence Pipeline Console */}
      {showConsole && (
        <div style={{ marginBottom: '24px' }}>
          <MlPipelineConsole onComplete={loadData} />
        </div>
      )}

      {/* 1. Top Scalar KPI Cards */}
      <div className="kpis">
        {cards.map(([l, v, d], i) => {
          const Icon = icon[i];
          return (
            <article className="kpi" key={l}>
              <Icon />
              <p>{l}</p>
              <strong>{Number(v).toLocaleString()}</strong>
              <small>{d}</small>
            </article>
          );
        })}
      </div>

      {/* 2. Risk Level Breakdown Visualization Panel */}
      <section className="panel" style={{ marginBottom: '16px', padding: '20px' }}>
        <div className="section-title" style={{ marginBottom: '14px' }}>
          <div>
            <p className="eyebrow">RISK LEVEL BREAKDOWN</p>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="var(--accent)" />
              Atm & Hotspot Threat Distribution
            </h2>
          </div>
          <span className="data-note" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Radio size={12} color="var(--success)" className="spin" style={{ animationDuration: '3s' }} />
            Live /dashboard/summary Telemetry
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'center' }}>
          {/* Recharts PieChart */}
          <div style={{ height: '220px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeChartData.length > 0 ? activeChartData : chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {(activeChartData.length > 0 ? activeChartData : chartData).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="#111413" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#191C1A',
                    border: '1px solid #292D2A',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  itemStyle={{ color: '#F1F3F1' }}
                  formatter={(val: any, name: any) => [`${val} Nodes (${Math.round((Number(val) / totalThreatEntities) * 100)}%)`, name]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  formatter={(value) => <span style={{ color: '#A6ADA8' }}>{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Severity Details Breakdown Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
            {chartData.map((item) => {
              const count = item.value;
              const pct = Math.round((count / totalThreatEntities) * 100);
              const color = item.color;

              return (
                <div
                  key={item.name}
                  style={{
                    background: 'var(--surface-muted)',
                    border: '1px solid var(--subtle-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    borderLeft: `4px solid ${color}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.5px', color }}>
                      {item.name.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--text-subtle)', fontFamily: 'JetBrains Mono' }}>
                      {pct}%
                    </span>
                  </div>
                  <strong style={{ display: 'block', fontSize: '20px', fontFamily: 'JetBrains Mono', margin: '4px 0', color: '#F1F3F1' }}>
                    {count}
                  </strong>
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>


      {/* 3. Main Dashboard Grid */}
      <div className="dashboard-grid">
        <section className="panel map-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">GIS RISK OVERLAY</p>
              <h2>Risk heatmap & ATM terminals</h2>
            </div>
            <span className="data-note">
              {p.length} Predictions · {locs.length} Monitored ATMs
            </span>
          </div>
          <MapView
            compact
            data={p.slice(0, 10)}
            locations={locs}
            onSelect={(x) => {
              if (x.id && !String(x.id).startsWith('LOC')) {
                nav(`/predictions/${x.id}`);
              } else if (x.location_id) {
                nav(`/predictions/p_${String(x.location_id).toLowerCase().replace('-', '_')}`);
              }
            }}
          />
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">7-DAY SIGNAL</p>
              <h2>Risk trend</h2>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.weekly_trend ?? []}>
                <XAxis dataKey="day" stroke="#6F7772" tick={{ fill: '#A6ADA8', fontSize: 11 }} />
                <YAxis domain={[0, 100]} stroke="#6F7772" tick={{ fill: '#A6ADA8', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#191C1A', border: '1px solid #292D2A', borderRadius: '6px' }} labelStyle={{ color: '#F1F3F1' }} itemStyle={{ color: '#48D878' }} />
                <Line
                  type="monotone"
                  dataKey="risk"
                  stroke="#48D878"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel wide">
          <div className="section-title">
            <div>
              <p className="eyebrow">PRIORITISED HOTSPOTS</p>
              <h2>Top predicted locations</h2>
            </div>
            <button className="link-btn" onClick={() => nav('/heatmap')}>
              View all locations
            </button>
          </div>
          <div className="location-list">
            {p.slice(0, 4).map((x) => (
              <button
                key={x.id}
                onClick={() => nav(`/predictions/${x.id}`)}
              >
                <span className="rank">{x.rank}</span>
                <span>
                  <b>{x.location_id}</b>
                  <small>
                    {x.location_name} · {x.region}
                  </small>
                </span>
                <strong>{x.risk_score}%</strong>
                <RiskBadge level={x.risk_level} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">RESPONSE QUEUE</p>
              <h2>Recent alerts</h2>
            </div>
            <button className="link-btn" onClick={() => nav('/alerts')}>
              Open queue
            </button>
          </div>
          <div className="alert-list">
            {a.slice(0, 4).map((x) => {
              const pp = p.find((q) => q.id === x.prediction_id);
              return (
                <button
                  key={x.id}
                  onClick={() => nav('/alerts')}
                >
                  <RiskBadge level={x.severity} />
                  <span>
                    <b>{pp ? pp.location_id : x.prediction_id}</b>
                    <small>
                      {pp ? `${pp.predicted_window} · ` : ''}{pp ? `${pp.risk_score}/100` : x.id}
                    </small>
                  </span>
                  <StatusBadge status={x.status} />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

