import React from 'react';

interface AssetMetric {
  label: string;
  count: string;
  pct: number; // 0 - 100
  color: string;
}

interface ConcentricAssetRingsProps {
  metrics?: AssetMetric[];
  centerLabel?: string;
  centerVal?: string;
}

export const ConcentricAssetRings: React.FC<ConcentricAssetRingsProps> = ({
  metrics = [
    { label: 'Domains', count: '2,415', pct: 90, color: '#00D26A' },
    { label: 'Subdomains', count: '18.2K', pct: 75, color: '#3276FF' },
    { label: 'Monitored IPs', count: '98.4K', pct: 60, color: '#FFB800' },
    { label: 'Cloud Assets', count: '35K', pct: 45, color: '#F73B3B' },
    { label: 'Certificates', count: '12K', pct: 30, color: '#82858E' },
  ],
  centerLabel = 'Domains',
  centerVal = '2,415',
}) => {
  const size = 180;
  const center = size / 2;
  const baseRadius = 32;
  const ringGap = 8;
  const strokeWidth = 5.5;

  return (
    <div className="concentric-rings-container">
      <div className="concentric-rings-graphic">
        <svg viewBox={`0 0 ${size} ${size}`} className="concentric-rings-svg">
          {metrics.map((m, idx) => {
            const rad = baseRadius + idx * ringGap;
            const circ = 2 * Math.PI * rad;
            const strokeDashoffset = circ - (circ * (m.pct / 100));

            return (
              <g key={m.label}>
                {/* Track */}
                <circle
                  cx={center}
                  cy={center}
                  r={rad}
                  fill="none"
                  stroke="#222327"
                  strokeWidth={strokeWidth}
                />
                {/* Active Segment */}
                <circle
                  cx={center}
                  cy={center}
                  r={rad}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circ}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${center} ${center})`}
                  style={{
                    transition: 'stroke-dashoffset 0.8s ease',
                    filter: idx === 0 ? 'drop-shadow(0 0 4px rgba(141, 229, 196, 0.4))' : undefined,
                  }}
                />
              </g>
            );
          })}
        </svg>

        <div className="concentric-center-label">
          <strong>{centerVal}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>

      <div className="concentric-legend">
        {metrics.map((m) => (
          <div key={m.label} className="concentric-legend-item">
            <span className="legend-dot" style={{ background: m.color }} />
            <span className="legend-name">{m.count} {m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default ConcentricAssetRings;
