import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ShieldCheck, UserX, Landmark, Smartphone, AlertTriangle } from 'lucide-react';

export interface EntityNodeData extends Record<string, unknown> {
  id: string;
  label: string;
  type: 'VICTIM' | 'MULE' | 'ATM' | 'DEVICE';
  riskScore: number;
  status: 'ACTIVE' | 'FROZEN' | 'INVESTIGATING';
  isInChain?: boolean;
  isDimmed?: boolean;
  metadata?: Record<string, any>;
  evidence_chain?: string[];
  linked_cases?: string[];
}

export default function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const isFrozen = data.status === 'FROZEN';
  const score = Number(data.riskScore || 0);
  const nType = String(data.type || 'MULE').toUpperCase();
  const isInChain = Boolean(data.isInChain);
  const isDimmed = Boolean(data.isDimmed);

  // Node type-specific icons & colors
  const getTypeConfig = () => {
    switch (nType) {
      case 'VICTIM':
        return {
          icon: ShieldCheck,
          title: 'VICTIM ACCOUNT',
          badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
          cardBg: 'bg-[#0B1712]/90 border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)]',
          accentColor: '#10b981'
        };
      case 'MULE':
        return {
          icon: UserX,
          title: 'MULE ACCOUNT',
          badgeBg: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
          cardBg: 'bg-[#18110B]/90 border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.15)]',
          accentColor: '#f97316'
        };
      case 'ATM':
        return {
          icon: Landmark,
          title: 'ATM TERMINAL',
          badgeBg: 'bg-red-500/20 text-red-400 border-red-500/40',
          cardBg: 'bg-[#1C0F11]/90 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]',
          accentColor: '#ef4444'
        };
      case 'DEVICE':
        return {
          icon: Smartphone,
          title: 'SHARED IP / DEVICE',
          badgeBg: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
          cardBg: 'bg-[#150E1B]/90 border-purple-500/50 shadow-[0_0_20px_rgba(168,85,247,0.15)]',
          accentColor: '#a855f7'
        };
      default:
        return {
          icon: AlertTriangle,
          title: 'ENTITY NODE',
          badgeBg: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
          cardBg: 'bg-[#111413]/90 border-gray-500/50 shadow-none',
          accentColor: '#6b7280'
        };
    }
  };

  const config = getTypeConfig();
  const IconComponent = config.icon;

  // Override border & glow if account is in highlighted evidence chain or FROZEN
  let cardBorder = config.cardBg;
  if (isInChain) {
    cardBorder = 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.7)] ring-2 ring-red-500/90 bg-[#1F0A0E]/95 scale-105';
  } else if (isFrozen) {
    cardBorder = 'border-emerald-500/80 shadow-[0_0_25px_rgba(16,185,129,0.35)] bg-[#041209]/95';
  }

  const opacityClass = isDimmed ? 'opacity-25 filter blur-[0.3px]' : 'opacity-100';

  return (
    <div className={`relative backdrop-blur-xl border rounded-xl p-4 w-[220px] text-gray-200 transition-all cursor-pointer ${cardBorder} ${opacityClass}`}>
      {/* Evidence Chain Tag */}
      {isInChain && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg border border-red-400 tracking-wider">
          Evidence Trail
        </div>
      )}

      {/* Target Connection Handles */}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-gray-400 border-2 border-black" />
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-gray-400 border-2 border-black" />

      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-1.5">
          <IconComponent size={14} style={{ color: isInChain ? '#ef4444' : isFrozen ? '#34d399' : config.accentColor }} />
          <span className="text-[9px] font-bold tracking-widest uppercase text-gray-300">
            {config.title}
          </span>
        </div>
        {isFrozen ? (
          <span className="text-[9px] font-extrabold bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded border border-emerald-400/50 uppercase tracking-wider">
            FROZEN
          </span>
        ) : (
          <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border ${isInChain ? 'bg-red-500/30 text-red-300 border-red-500/60' : config.badgeBg}`}>
            {score >= 80 ? 'CRITICAL' : score >= 50 ? 'HIGH' : 'ACTIVE'}
          </span>
        )}
      </div>

      {/* Main Label / Node ID */}
      <div className="text-xs font-semibold tracking-wide text-white mb-1 truncate" title={data.label || data.id}>
        {data.label || data.id}
      </div>
      <div className="text-[9px] font-mono text-gray-400 mb-2 truncate">
        ID: {data.id}
      </div>

      {/* Cross-Case / Multi-FIR Indicator Badge */}
      {data.linked_cases && data.linked_cases.length > 1 && (
        <div className="text-[8px] font-mono font-bold text-purple-300 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/50 mb-2 flex items-center justify-between">
          <span>🚨 MULTI-FIR LINK</span>
          <span>{data.linked_cases.length} Cases</span>
        </div>
      )}

      {/* Threat Level Bar & Risk Score */}
      <div className="pt-2 border-t border-white/10 flex justify-between items-center">
        <span className="text-[9px] uppercase tracking-widest text-gray-400 font-semibold">Threat Level</span>
        <span className={`text-sm font-extrabold font-mono ${isInChain ? 'text-red-400' : 'text-white'}`}>
          {score.toFixed(1)}
          <span className="text-[9px] text-gray-400 font-bold ml-0.5">%</span>
        </span>
      </div>

      {/* Source Connection Handles */}
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-gray-400 border-2 border-black" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-gray-400 border-2 border-black" />
    </div>
  );
}
