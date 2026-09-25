import React from 'react';

export interface NodeRadialData {
  label: string;
  value: number;
  color: string;
}

interface RiskNodeRadialChartProps {
  data?: NodeRadialData[];
}

export const RiskNodeRadialChart: React.FC<RiskNodeRadialChartProps> = ({
  data = [
    { label: 'Bank Kiosks', value: 2850, color: '#38BDF8' },
    { label: 'Micro-ATMs', value: 1420, color: '#818CF8' },
    { label: 'POS Cash Points', value: 980, color: '#FBBF24' },
    { label: 'Metro ATM Hubs', value: 89, color: '#FB923C' },
    { label: 'High-Risk Clusters', value: 18, color: '#EF4444' },
  ],
}) => {
  // Sort or preserve outer-to-inner ordering
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  // Mathematical scaling: The largest value dictates the 100% ring length
  const maxValue = Math.max(...sortedData.map((d) => d.value), 1);
  const totalNodes = sortedData.reduce((acc, curr) => acc + curr.value, 0);

  // SVG Configuration
  const size = 200;
  const center = size / 2;
  const strokeWidth = 7;
  const gap = 5;

  return (
    <div className="risk-node-radial-chart">
      {/* Mathematical SVG Radial Chart */}
      <div className="radial-graphic-wrap">
        {/* Rotate -90deg so the rings start from the top (12 o'clock) */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          className="radial-svg"
        >
          {sortedData.map((item, index) => {
            // Calculate radius dynamically shrinking inward for each data point
            const radius = (size / 2) - (strokeWidth / 2) - 4 - (index * (strokeWidth + gap));
            const circumference = 2 * Math.PI * radius;

            // Calculate proportional offset
            const percentage = Math.min(1, Math.max(0.06, item.value / maxValue));
            const strokeDashoffset = circumference - (percentage * circumference);

            return (
              <g key={item.label}>
                {/* Background Track */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  className="radial-bg-track"
                  strokeWidth={strokeWidth}
                />
                {/* Illuminated Data Ring */}
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </g>
            );
          })}
        </svg>

        {/* Centered Typography Badge */}
        <div className="radial-center-badge">
          <span className="radial-total-val">
            {totalNodes.toLocaleString()}
          </span>
          <span className="radial-total-label">
            Total Nodes
          </span>
        </div>
      </div>

      {/* Structured Legend */}
      <div className="radial-legend-list">
        {sortedData.map((item) => (
          <div key={item.label} className="radial-legend-row">
            {/* Colored Indicator Node */}
            <span
              className="radial-legend-dot"
              style={{
                backgroundColor: item.color,
              }}
            />
            {/* Value */}
            <span className="radial-legend-val">
              {item.value.toLocaleString()}
            </span>
            {/* Label */}
            <span className="radial-legend-name" title={item.label}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskNodeRadialChart;

