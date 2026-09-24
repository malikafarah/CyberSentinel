import React from 'react';

interface RiskScoreGaugeProps {
  score: number;
  label?: string;
  maxScore?: number;
}

export const RiskScoreGauge: React.FC<RiskScoreGaugeProps> = ({
  score = 78,
  label = 'HIGH RISK',
  maxScore = 100,
}) => {
  const clampedScore = Math.max(0, Math.min(score, maxScore));
  const normalized = clampedScore / maxScore; // 0 to 1

  // Semi-circle angles from -140 deg to +140 deg (280 degree arc)
  const startAngle = -140;
  const endAngle = 140;
  const currentAngle = startAngle + normalized * (endAngle - startAngle);

  // SVG arc calculation helper
  const radius = 70;
  const center = 90;
  const strokeWidth = 9;

  const polarToCartesian = (centerX: number, centerY: number, rad: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + rad * Math.cos(angleInRadians),
      y: centerY + rad * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, rad: number, start: number, end: number) => {
    const startPt = polarToCartesian(x, y, rad, end);
    const endPt = polarToCartesian(x, y, rad, start);
    const largeArcFlag = end - start <= 180 ? '0' : '1';
    return ['M', startPt.x, startPt.y, 'A', rad, rad, 0, largeArcFlag, 0, endPt.x, endPt.y].join(' ');
  };

  const backgroundArc = describeArc(center, center, radius, startAngle, endAngle);
  const activeArc = describeArc(center, center, radius, startAngle, currentAngle);

  // Needle tip
  const needleLength = 52;
  const needleTip = polarToCartesian(center, center, needleLength, currentAngle);

  const getRiskColor = (sc: number) => {
    if (sc >= 75) return '#F73B3B';
    if (sc >= 50) return '#FFB800';
    if (sc >= 25) return '#3276FF';
    return '#00D26A';
  };

  const riskColor = getRiskColor(score);

  return (
    <div className="risk-gauge-wrapper">
      <svg viewBox="0 0 180 145" className="risk-gauge-svg">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D26A" />
            <stop offset="40%" stopColor="#3276FF" />
            <stop offset="70%" stopColor="#FFB800" />
            <stop offset="100%" stopColor="#F73B3B" />
          </linearGradient>
          <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Background Track */}
        <path
          d={backgroundArc}
          fill="none"
          stroke="#222327"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Active Colored Arc */}
        <path
          d={activeArc}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter="url(#gaugeGlow)"
        />

        {/* Needle Line */}
        <line
          x1={center}
          y1={center}
          x2={needleTip.x}
          y2={needleTip.y}
          stroke="#FFFFFF"
          strokeWidth={2.5}
          strokeLinecap="round"
          filter="drop-shadow(0 0 5px rgba(0, 210, 106, 0.7))"
        />

        {/* Needle Center Hub */}
        <circle cx={center} cy={center} r={5} fill="#00D26A" />
        <circle cx={center} cy={center} r={2} fill="#0B0C10" />

        {/* 0 and 100 markers */}
        <text x="25" y="132" fill="#82858E" fontSize="9" fontFamily="var(--font-mono)">0</text>
        <text x="142" y="132" fill="#82858E" fontSize="9" fontFamily="var(--font-mono)">100</text>
      </svg>

      <div className="gauge-readout">
        <span className="gauge-score-label">Live Score: {score}</span>
        <strong className="gauge-score-val">{score}</strong>
        <span
          className="gauge-risk-pill"
          style={{ color: riskColor, borderColor: `${riskColor}55`, background: `${riskColor}18` }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};
export default RiskScoreGauge;
