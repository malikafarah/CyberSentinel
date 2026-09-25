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

  // Node type-specific light & dark background, border, and accent colors
  const getTypeConfig = () => {
    if (isFrozen) {
      return {
        icon: UserX,
        title: 'FROZEN MULE',
        cardBg: 'bg-[#ECFEFF] dark:bg-[#041209]/95 border-[#A5F3FC] dark:border-cyan-500/60 shadow-sm shadow-cyan-900/5 dark:shadow-[0_0_20px_rgba(6,182,212,0.25)]',
        accentColor: '#0E7490',
        darkAccentColor: '#22D3EE',
        headerText: 'text-cyan-800 dark:text-cyan-300',
      };
    }

    switch (nType) {
      case 'VICTIM':
        return {
          icon: ShieldCheck,
          title: 'VICTIM ACCOUNT',
          cardBg: 'bg-[#F0FDF4] dark:bg-[#0B1712]/90 border-[#86EFAC] dark:border-emerald-500/50 shadow-sm shadow-emerald-900/5 dark:shadow-[0_0_20px_rgba(16,185,129,0.15)]',
          accentColor: '#15803D',
          darkAccentColor: '#34D399',
          headerText: 'text-emerald-800 dark:text-emerald-300',
        };
      case 'MULE':
        return {
          icon: UserX,
          title: 'MULE ACCOUNT',
          cardBg: 'bg-[#FFFBEB] dark:bg-[#18110B]/90 border-[#FCD34D] dark:border-orange-500/50 shadow-sm shadow-amber-900/5 dark:shadow-[0_0_20px_rgba(249,115,22,0.15)]',
          accentColor: '#B45309',
          darkAccentColor: '#FB923C',
          headerText: 'text-amber-800 dark:text-orange-300',
        };
      case 'ATM':
        return {
          icon: Landmark,
          title: 'ATM TERMINAL',
          cardBg: 'bg-[#FEF2F2] dark:bg-[#1C0F11]/90 border-[#FECACA] dark:border-red-500/50 shadow-sm shadow-rose-900/5 dark:shadow-[0_0_20px_rgba(239,68,68,0.2)]',
          accentColor: '#B91C1C',
          darkAccentColor: '#F87171',
          headerText: 'text-rose-800 dark:text-red-300',
        };
      case 'DEVICE':
        return {
          icon: Smartphone,
          title: 'SHARED IP / DEVICE',
          cardBg: 'bg-[#FAF5FF] dark:bg-[#150E1B]/90 border-[#E9D5FF] dark:border-purple-500/50 shadow-sm shadow-purple-900/5 dark:shadow-[0_0_20px_rgba(168,85,247,0.15)]',
          accentColor: '#7E22CE',
          darkAccentColor: '#C084FC',
          headerText: 'text-purple-800 dark:text-purple-300',
        };
      default:
        return {
          icon: AlertTriangle,
          title: 'ENTITY NODE',
          cardBg: 'bg-slate-50 dark:bg-[#111413]/90 border-slate-200 dark:border-gray-500/50 shadow-sm',
          accentColor: '#475569',
          darkAccentColor: '#9CA3AF',
          headerText: 'text-slate-700 dark:text-gray-300',
        };
    }
  };

  const config = getTypeConfig();
  const IconComponent = config.icon;

  // Status Badge Component
  const renderBadge = () => {
    if (isFrozen) {
      return (
        <span className="text-[9px] font-extrabold bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD] dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-400/50 px-2 py-0.5 rounded uppercase tracking-wider font-mono">
          FROZEN
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="text-[9px] font-extrabold bg-[#FEE2E2] text-[#DC2626] border border-[#FCA5A5] dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/40 px-2 py-0.5 rounded uppercase tracking-wider font-mono">
          CRITICAL
        </span>
      );
    }
    if (score >= 50) {
      return (
        <span className="text-[9px] font-extrabold bg-[#FFEDD5] text-[#C2410C] border border-[#FDBA74] dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/40 px-2 py-0.5 rounded uppercase tracking-wider font-mono">
          HIGH
        </span>
      );
    }
    return (
      <span className="text-[9px] font-extrabold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A] dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40 px-2 py-0.5 rounded uppercase tracking-wider font-mono">
        ACTIVE
      </span>
    );
  };

  // Threat Level Score Color
  const getScoreColorClass = (sc: number) => {
    if (sc >= 80) return 'text-[#DC2626] dark:text-red-400';
    if (sc >= 50) return 'text-[#D97706] dark:text-amber-400';
    return 'text-[#16A34A] dark:text-emerald-400';
  };

  // Override border & glow if account is in highlighted evidence chain
  let cardBorder = config.cardBg;
  if (isInChain) {
    cardBorder = 'border-red-500 bg-[#FEF2F2] dark:bg-[#1F0A0E]/95 shadow-md shadow-red-500/20 dark:shadow-[0_0_30px_rgba(239,68,68,0.7)] ring-2 ring-red-500/80 scale-105';
  }

  const opacityClass = isDimmed ? 'opacity-25 filter blur-[0.3px]' : 'opacity-100';

  return (
    <div className={`relative backdrop-blur-md border-[1.5px] rounded-lg p-3.5 w-[220px] transition-all cursor-pointer ${cardBorder} ${opacityClass}`}>
      {/* Evidence Chain Tag */}
      {isInChain && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2.5 py-0.5 rounded-full shadow-md border border-red-400 tracking-wider">
          Evidence Trail
        </div>
      )}

      {/* Target Connection Handles */}
      <Handle type="target" position={Position.Top} className="w-2.5 h-2.5 !bg-slate-400 dark:!bg-gray-400 border-2 border-white dark:border-slate-900" />
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-slate-400 dark:!bg-gray-400 border-2 border-white dark:border-slate-900" />

      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-slate-200/80 dark:border-white/10 mb-2.5">
        <div className="flex items-center gap-1.5">
          <IconComponent size={14} style={{ color: isInChain ? '#DC2626' : config.accentColor }} />
          <span className={`text-[10px] font-bold tracking-wider uppercase font-sans ${config.headerText}`}>
            {config.title}
          </span>
        </div>
        {renderBadge()}
      </div>

      {/* Main Label / Node ID */}
      <div className="text-xs font-bold tracking-wide text-slate-900 dark:text-white mb-0.5 truncate" title={data.label || data.id}>
        {data.label || data.id}
      </div>
      <div className="text-[10px] font-mono text-slate-500 dark:text-gray-400 mb-2 truncate">
        ID: {data.id}
      </div>

      {/* Cross-Case / Multi-FIR Indicator Badge */}
      {data.linked_cases && data.linked_cases.length > 1 && (
        <div className="text-[9px] font-mono font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded border border-purple-300 dark:border-purple-500/50 mb-2 flex items-center justify-between">
          <span>🚨 MULTI-FIR LINK</span>
          <span>{data.linked_cases.length} Cases</span>
        </div>
      )}

      {/* Threat Level Bar & Risk Score */}
      <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 flex justify-between items-center">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-gray-400 font-medium">Threat Level</span>
        <span className={`text-xs font-extrabold font-mono ${getScoreColorClass(score)}`}>
          {score.toFixed(1)}%
        </span>
      </div>

      {/* Source Connection Handles */}
      <Handle type="source" position={Position.Bottom} className="w-2.5 h-2.5 !bg-slate-400 dark:!bg-gray-400 border-2 border-white dark:border-slate-900" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-slate-400 dark:!bg-gray-400 border-2 border-white dark:border-slate-900" />
    </div>
  );
}

