import { AlertTriangle, ShieldAlert, Sparkles, Search } from 'lucide-react';

export interface EntityActionPanelProps {
  riskScore: number;
  entityStatus?: string;
  onInitiateLien?: () => void;
  onMarkDeepDive?: () => void;
  className?: string;
}

export function EntityActionPanel({
  riskScore,
  entityStatus,
  onInitiateLien,
  onMarkDeepDive,
  className = ''
}: EntityActionPanelProps) {
  const numericScore = typeof riskScore === 'number' ? riskScore : parseFloat(riskScore) || 0;

  // HIGH CONFIDENCE TIER (> 90%)
  if (numericScore > 90) {
    return (
      <div className={`bg-red-950/40 dark:bg-red-950/40 bg-red-50 p-4 border border-red-500/40 dark:border-red-500/40 border-red-200 rounded-lg text-gray-200 ${className}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="badge bg-red-600 text-white text-xs px-2.5 py-1 rounded font-bold font-mono tracking-wider uppercase inline-flex items-center gap-1.5 shadow-sm">
            <ShieldAlert size={12} /> HIGH CONFIDENCE: {numericScore.toFixed(0)}%
          </span>
          {entityStatus && (
            <span className="text-[10px] font-mono uppercase text-red-300 font-semibold">{entityStatus}</span>
          )}
        </div>
        <p className="text-sm mt-2 text-red-200 dark:text-red-200 text-gray-800 font-sans leading-relaxed">
          Eligible for automated CFCFRMS Lien Marking.
        </p>
        <button
          type="button"
          onClick={onInitiateLien}
          className="mt-3 bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 rounded-lg w-full font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.35)] cursor-pointer flex items-center justify-center gap-2"
        >
          <Sparkles size={14} /> Initiate Lien Request
        </button>
      </div>
    );
  }

  // MANUAL REVIEW TIER (70% - 90%]
  if (numericScore > 70) {
    return (
      <div className={`bg-amber-950/40 dark:bg-amber-950/40 bg-yellow-50 p-4 border border-yellow-500/40 dark:border-yellow-500/40 border-yellow-200 rounded-lg text-gray-200 ${className}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="badge bg-yellow-600 text-white text-xs px-2.5 py-1 rounded font-bold font-mono tracking-wider uppercase inline-flex items-center gap-1.5 shadow-sm">
            <AlertTriangle size={12} /> MANUAL REVIEW: {numericScore.toFixed(0)}%
          </span>
          {entityStatus && (
            <span className="text-[10px] font-mono uppercase text-yellow-300 font-semibold">{entityStatus}</span>
          )}
        </div>
        <p className="text-sm mt-2 text-yellow-200 dark:text-yellow-200 text-gray-800 font-sans leading-relaxed">
          Suspicious activity detected. Investigator review required before action.
        </p>
        <button
          type="button"
          onClick={onMarkDeepDive}
          className="mt-3 border border-yellow-600 hover:bg-yellow-600/15 text-yellow-400 dark:text-yellow-400 text-yellow-700 px-4 py-2.5 rounded-lg w-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <Search size={14} /> Mark for Deep Dive
        </button>
      </div>
    );
  }

  // LOW RISK / INSUFFICIENT CONFIDENCE (< 70%)
  return (
    <div className={`p-4 text-gray-400 text-xs font-mono bg-white/[0.02] border border-white/5 rounded-lg text-center ${className}`}>
      Insufficient risk score for action.
    </div>
  );
}

export default EntityActionPanel;
