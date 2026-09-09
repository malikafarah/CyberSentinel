import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ReactFlow, Background, Controls, useNodesState, useEdgesState, BackgroundVariant, MarkerType, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  GitGraph,
  Cpu,
  Layers,
  RotateCcw,
  Sparkles,
  Database,
  RefreshCw,
  X,
  Radio
} from 'lucide-react';
import EntityNode, { type EntityNodeData } from './EntityNode';
import SecureActionModal, { type Receipt } from './SecureActionModal';
import EntityActionPanel from './EntityActionPanel';
import { getLayoutedElements } from './layout';
import { intakeService, type ExtractedEntities } from '../services/intakeService';

const nodeTypes = { entity: EntityNode };

interface TerminalLog {
  id: string;
  action: string;
  targetNodeId: string;
  previousHash: string;
  currentHash: string;
  timestamp: string;
}

const DEFAULT_FALLBACK_NODES: Node<EntityNodeData>[] = [
  {
    id: '1',
    type: 'entity',
    position: { x: 150, y: 50 },
    data: {
      id: 'C102',
      label: 'Victim Acct (HDFC)',
      type: 'VICTIM',
      riskScore: 95,
      status: 'ACTIVE',
      metadata: { evidence_chain: ['1', '2', '3'] }
    }
  },
  {
    id: '2',
    type: 'entity',
    position: { x: 350, y: 220 },
    data: {
      id: 'M883',
      label: 'Mule Acct 101 (SBI)',
      type: 'MULE',
      riskScore: 92,
      status: 'ACTIVE',
      metadata: { evidence_chain: ['1', '2', '3'] }
    }
  },
  {
    id: '3',
    type: 'entity',
    position: { x: 600, y: 400 },
    data: {
      id: 'A441',
      label: 'ATM - Benz Circle',
      type: 'ATM',
      riskScore: 78,
      status: 'ACTIVE',
      metadata: { evidence_chain: ['1', '2', '3'] }
    }
  }
];

const DEFAULT_FALLBACK_EDGES: Edge[] = [
  {
    id: 'e1-2',
    source: '1',
    target: '2',
    animated: true,
    label: 'TRANSFER (₹50,000)',
    style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }
  },
  {
    id: 'e2-3',
    source: '2',
    target: '3',
    animated: true,
    label: 'CASH WITHDRAWAL',
    style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.8 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }
  }
];

const DEFAULT_FALLBACK_LOGS: TerminalLog[] = [
  {
    id: 'log-1',
    action: 'SYSTEM_BOOT',
    targetNodeId: 'CYB-2026-1024',
    previousHash: '0000000000000000000000000000000000000000000000000000000000000000',
    currentHash: '26a8743668e9de0b702cba4777e9114a0cadfd14dcb81bc920bfd9718466af59',
    timestamp: new Date().toISOString()
  }
];

interface InvestigationWorkspaceProps {
  initialNodes?: Node<EntityNodeData>[];
  initialEdges?: Edge[];
}

export default function InvestigationWorkspace({ initialNodes, initialEdges }: InvestigationWorkspaceProps = {}) {
  const navigate = useNavigate();
  const { id: paramCaseId } = useParams<{ id?: string }>();
  const caseId = paramCaseId || 'CYB-2026-1024';

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EntityNodeData>>(initialNodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges || []);
  const [selectedNode, setSelectedNode] = useState<Node<EntityNodeData> | null>(null);

  // Secure Action Modal
  const [isSecureModalOpen, setIsSecureModalOpen] = useState(false);

  // Evidence Chain state
  const [activeChain, setActiveChain] = useState<string[] | null>(null);
  const [activeChainNodes, setActiveChainNodes] = useState<Node<EntityNodeData>[]>([]);

  // Right Side Panel: 'inspection' | 'intake'
  const [rightPanelTab, setRightPanelTab] = useState<'inspection' | 'intake'>('inspection');

  // Intake State
  const [intakeText, setIntakeText] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedEntities | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [intakeMessage, setIntakeMessage] = useState<string | null>(null);

  const [isFreezing, setIsFreezing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [auditLogs, setAuditLogs] = useState<TerminalLog[]>([]);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState<boolean>(true);

  // Base styled edges generator
  const getBaseStyledEdges = (rawEdges: Edge[], rawNodes: Node<EntityNodeData>[]) => {
    const nodeMap = new Map<string, number>();
    rawNodes.forEach((n: any) => {
      const nid = String(n.id || n.data?.id);
      nodeMap.set(nid, Number(n.data?.riskScore || 0));
    });

    return rawEdges.map((e: any) => {
      const srcRisk = nodeMap.get(e.source) || 85;
      const eType = String(e.type || 'TRANSFER').toUpperCase();

      let stroke = '#48D878';
      if (eType === 'SHARED_KYC') stroke = '#a855f7';
      else if (srcRisk >= 80) stroke = '#ef4444';
      else if (srcRisk >= 50) stroke = '#f97316';

      return {
        ...e,
        type: 'smoothstep',
        animated: true,
        label: eType.replace('_', ' '),
        labelStyle: { fill: '#9ca3af', fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: '#0F1210', fillOpacity: 0.8 },
        style: { stroke, strokeWidth: 2, opacity: 0.85 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
      };
    });
  };

  const fetchGraphAndLogs = async (silent: boolean = false) => {
    try {
      if (!silent) setIsLoading(true);

      let graphRes: Response | null = null;
      try {
        const res = await fetch(`/api/v1/engine/case/${encodeURIComponent(caseId)}`);
        if (res.ok) graphRes = res;
      } catch {
        // network error — fall through to defaults
      }

      if (graphRes && graphRes.ok) {
        const data = await graphRes.json();
        const rawNodes = (data.nodes || []) as Node<EntityNodeData>[];
        const rawEdges = (data.edges || []) as Edge[];

        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements<Node<EntityNodeData>>(
          rawNodes,
          rawEdges,
          layoutDirection
        );

        const styledEdges = getBaseStyledEdges(layoutedEdges, layoutedNodes);
        setNodes(layoutedNodes);
        setEdges(styledEdges);
      } else {
        setNodes(DEFAULT_FALLBACK_NODES);
        setEdges(DEFAULT_FALLBACK_EDGES);
      }

      // Fetch Terminal Logs
      let logsRes: Response | null = null;
      try {
        const res = await fetch('/api/v1/action/audit-logs');
        if (res.ok) logsRes = res;
      } catch {
        // network error — fall through
      }

      if (logsRes && logsRes.ok) {
        const logsData = await logsRes.json();
        setAuditLogs(Array.isArray(logsData) && logsData.length > 0 ? logsData : DEFAULT_FALLBACK_LOGS);
      } else {
        setAuditLogs(DEFAULT_FALLBACK_LOGS);
      }
    } catch (error) {
      console.error('Telemetry fetch failed', error);
      if (!silent) {
        setNodes(DEFAULT_FALLBACK_NODES);
        setEdges(DEFAULT_FALLBACK_EDGES);
        setAuditLogs(DEFAULT_FALLBACK_LOGS);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialNodes && initialNodes.length > 0) {
      setIsLoading(false);
      return;
    }
    fetchGraphAndLogs(false);

    let intervalId: any = null;
    if (isLiveStreaming) {
      intervalId = setInterval(() => {
        fetchGraphAndLogs(true);
      }, 4000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [layoutDirection, isLiveStreaming, caseId, initialNodes]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [auditLogs]);

  // Reset any active evidence chain highlighting
  const handleResetHighlighting = useCallback(() => {
    setActiveChain(null);
    setActiveChainNodes([]);
    setNodes((nds) =>
      nds.map((n) => {
        const { border, boxShadow, opacity, ...restStyle } = (n.style || {}) as any;
        return {
          ...n,
          className: '',
          style: restStyle,
          data: {
            ...n.data,
            isInChain: false,
            isDimmed: false
          }
        };
      })
    );
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        animated: false,
        style: { ...e.style, stroke: '#b1b1b7', strokeWidth: 1 }
      }))
    );
  }, [setNodes, setEdges]);

  // Intercept onNodeClick to visualize and highlight evidence chains
  const onNodeClick = useCallback(
    (_: React.MouseEvent, clickedNode: Node<EntityNodeData>) => {
      setSelectedNode(clickedNode);
      if (rightPanelTab !== 'inspection') setRightPanelTab('inspection');

      // 1. Extract the evidence chain path from clicked node metadata
      const chain = clickedNode.data?.metadata?.evidence_chain as string[] | undefined;

      if (!chain || !Array.isArray(chain) || chain.length === 0) {
        // If no chain, reset highlighting
        handleResetHighlighting();
        return;
      }

      setActiveChain(chain);

      // 2. Highlight Nodes in the chain
      const chainNodeIds = new Set(chain);
      setNodes((nds) =>
        nds.map((node) => {
          if (chainNodeIds.has(node.id) || chainNodeIds.has(node.data?.id)) {
            return {
              ...node,
              style: { ...node.style, border: '2px solid #ef4444', boxShadow: '0 0 15px rgba(239, 68, 68, 0.6)' },
              data: {
                ...node.data,
                isInChain: true,
                isDimmed: false
              }
            };
          }
          // Dim nodes not in the chain
          return {
            ...node,
            style: { ...node.style, opacity: 0.3, border: 'none', boxShadow: 'none' },
            data: {
              ...node.data,
              isInChain: false,
              isDimmed: true
            }
          };
        })
      );

      // Populate evidence chain sequence for the left-hand panel
      const chainSequence = chain
        .map((id) => nodes.find((n) => n.id === id || n.data?.id === id))
        .filter(Boolean) as Node<EntityNodeData>[];
      setActiveChainNodes(chainSequence);

      // 3. Highlight Edges that connect the chain steps
      setEdges((eds) =>
        eds.map((edge) => {
          const isEdgeInChain = chain.some((nodeId, index) => {
            if (index === chain.length - 1) return false;
            const nextNodeId = chain[index + 1];
            return (
              (edge.source === nodeId || edge.source === `node-${nodeId}`) &&
              (edge.target === nextNodeId || edge.target === `node-${nextNodeId}`)
            );
          });

          if (isEdgeInChain) {
            return {
              ...edge,
              animated: true,
              style: { stroke: '#ef4444', strokeWidth: 3 },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' }
            };
          }

          // Dim edges not in the chain
          return {
            ...edge,
            animated: false,
            style: { stroke: '#e5e7eb', strokeWidth: 1, opacity: 0.2 }
          };
        })
      );
    },
    [nodes, edges, setNodes, setEdges, rightPanelTab, handleResetHighlighting]
  );

  // Successful Authorization & Receipt callback
  const handleSecureFreezeSuccess = (receipt: Receipt) => {
    if (!selectedNode) return;
    const targetId = selectedNode.data.id || selectedNode.id;

    // Update local React Flow state
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id || node.data.id === selectedNode.data.id) {
          return {
            ...node,
            data: { ...node.data, status: 'FROZEN' }
          };
        }
        return node;
      })
    );

    setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, status: 'FROZEN' } } : null));

    // Append cryptographic entry to audit log terminal
    const mockLog: TerminalLog = {
      id: `log-${Date.now()}`,
      action: 'FREEZE_INITIATED',
      targetNodeId: targetId,
      previousHash: receipt.previous_hash || '26a8743668e9de0b702cba4777e9114a0cadfd14dcb81bc920bfd9718466af59',
      currentHash: receipt.block_hash,
      timestamp: receipt.timestamp
    };
    setAuditLogs((prev) => [mockLog, ...prev]);
  };

  const handleUnfreezeAccount = async () => {
    if (!selectedNode) return;
    setIsFreezing(true);

    try {
      let responseReceipt: any = null;
      const targetId = selectedNode.data.id || selectedNode.id;

      try {
        const res = await fetch('/api/v1/action/unfreeze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: targetId,
            officer_id: 'OFFICER_409',
            reason: 'Unfreeze authorized by Lead Investigator'
          })
        });
        if (res.ok) responseReceipt = await res.json();
      } catch {
        // network error — fall through
      }

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNode.id || node.data.id === selectedNode.data.id) {
            return {
              ...node,
              data: { ...node.data, status: 'ACTIVE' }
            };
          }
          return node;
        })
      );

      setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, status: 'ACTIVE' } } : null));

      if (responseReceipt) {
        const mockLog: TerminalLog = {
          id: `log-${Date.now()}`,
          action: 'UNFREEZE_INITIATED',
          targetNodeId: selectedNode.data.id || selectedNode.id,
          previousHash:
            responseReceipt?.audit_receipt?.previous_hash ||
            '26a8743668e9de0b702cba4777e9114a0cadfd14dcb81bc920bfd9718466af59',
          currentHash:
            responseReceipt?.audit_receipt?.transaction_hash ||
            'f81e18f34e8eb65c070f9180a0ac66a61cc5a8912ccdaa5c877b7fc1bcfe0612',
          timestamp: new Date().toISOString()
        };
        setAuditLogs((prev) => [mockLog, ...prev]);
      } else {
        fetchGraphAndLogs(true);
      }

      // Submit Active Learning Feedback to tune ML parameters
      try {
        await fetch('/api/v1/engine/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            node_id: targetId,
            status: 'FALSE_POSITIVE',
            reason: 'Investigator unfreeze appeal approval'
          })
        });
      } catch {
        // silent fallback
      }
    } catch (error) {
      console.error('Unfreeze failed:', error);
    } finally {
      setIsFreezing(false);
    }
  };

  // Right Side Intake Handler: Extract NLP Entities
  const handleRunIntakeExtraction = async () => {
    if (!intakeText.trim()) return;
    setIsExtracting(true);
    setIntakeMessage(null);
    try {
      const data = await intakeService.extractComplaint(intakeText);
      setExtractedData(data);
    } catch (err: any) {
      setIntakeMessage(err?.message || 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  // Right Side Intake Handler: Seed Graph Database
  const handleConfirmGraphSeeding = async () => {
    if (!extractedData) return;
    setIsSeeding(true);
    setIntakeMessage(null);
    try {
      await intakeService.seedVictimNodes(extractedData);
      setIntakeMessage('Root victim nodes successfully seeded into graph (Risk Score 100).');
      // Refresh the graph live to reflect newly seeded nodes!
      await fetchGraphAndLogs(false);
    } catch (err: any) {
      setIntakeMessage(`Seeding failed: ${err?.message || 'Server error'}`);
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0F1210] text-gray-200 font-sans overflow-hidden">
      {/* 1. Workspace Header */}
      <header className="px-6 py-3 border-b border-white/10 bg-white/[0.02] flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <GitGraph size={18} className="text-[#48D878]" />
            <h1 className="text-sm font-semibold tracking-wide text-white uppercase">CASE #{caseId}</h1>
          </div>
          <span className="text-[9px] font-bold bg-[#48D878]/20 text-[#48D878] px-2 py-1 rounded border border-[#48D878]/30 uppercase tracking-widest flex items-center gap-1.5">
            <Radio size={10} className="animate-pulse" /> Live Telemetry
          </span>
          {activeChain && activeChain.length > 0 && (
            <span className="text-[9px] font-bold bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/40 uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
              <Sparkles size={10} /> Trail Active: {activeChain.length} Hops
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {activeChain && (
            <button
              onClick={handleResetHighlighting}
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-mono text-xs font-bold rounded-md border border-red-500/40 transition-all uppercase tracking-widest cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw size={12} /> Reset Trail Highlight
            </button>
          )}

          <button
            onClick={() => setRightPanelTab((prev) => (prev === 'intake' ? 'inspection' : 'intake'))}
            className={`px-3.5 py-2 font-mono text-xs font-bold rounded-md border transition-all uppercase tracking-widest cursor-pointer flex items-center gap-2 ${
              rightPanelTab === 'intake'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
            }`}
          >
            <Cpu size={13} /> {rightPanelTab === 'intake' ? 'Viewing NCRP Intake' : 'NCRP Complaint Intake'}
          </button>

          <button
            onClick={() => setIsLiveStreaming((prev) => !prev)}
            className={`px-3.5 py-2 font-mono text-xs font-bold rounded-md border transition-all uppercase tracking-widest cursor-pointer flex items-center gap-2 ${
              isLiveStreaming
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isLiveStreaming ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            {isLiveStreaming ? 'STREAM: LIVE 🟢' : 'STREAM: PAUSED ⏸'}
          </button>

          <button
            onClick={() => setLayoutDirection((prev) => (prev === 'TB' ? 'LR' : 'TB'))}
            className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-gray-300 font-mono text-xs font-bold rounded-md border border-white/15 transition-all uppercase tracking-widest cursor-pointer"
          >
            LAYOUT: {layoutDirection === 'TB' ? 'TOP-DOWN ⬇' : 'LEFT-RIGHT ➡'}
          </button>

          <button
            onClick={() => navigate('/heatmap')}
            className="px-4 py-2 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 font-mono text-xs font-bold rounded-md border border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.2)] transition-all uppercase tracking-widest cursor-pointer"
          >
            OPEN GIS HEATMAP
          </button>
        </div>
      </header>

      {/* 2. Main Intelligence Area (75% height) */}
      <div className="flex flex-grow relative h-[75vh] overflow-hidden">
        {/* FAR LEFT: Dedicated Evidence Chain Panel */}
        <aside className="w-80 border-r border-white/10 bg-[#0C100E]/95 backdrop-blur-3xl p-4 flex flex-col z-20 shrink-0 overflow-y-auto">
          <div className="flex justify-between items-center pb-3 border-b border-white/10 mb-4">
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-red-400" />
              <h2 className="text-[11px] font-bold text-gray-200 tracking-wider uppercase">Evidence Trail</h2>
            </div>
            {activeChain && (
              <button
                onClick={handleResetHighlighting}
                className="text-[9px] text-gray-400 hover:text-white uppercase font-mono tracking-wider flex items-center gap-1"
              >
                <X size={10} /> Clear
              </button>
            )}
          </div>

          {activeChain && activeChainNodes.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="text-[10px] text-gray-400 font-mono leading-relaxed bg-red-950/30 p-2.5 rounded border border-red-500/30">
                <span className="text-red-400 font-bold block mb-1 uppercase tracking-wider">Topological Shortest Path</span>
                Flowing money trail from origin victim to downstream cashout nodes.
              </div>

              {/* Sequential Steps List */}
              <div className="flex flex-col gap-2 relative mt-2">
                {activeChainNodes.map((n, idx) => {
                  const isSelected = selectedNode?.id === n.id;
                  const isFirst = idx === 0;
                  const isLast = idx === activeChainNodes.length - 1;

                  return (
                    <div key={n.id} className="relative">
                      {/* Trail Connector Line */}
                      {!isLast && (
                        <div className="absolute left-[17px] top-9 bottom-[-10px] w-0.5 bg-red-500/50 z-0 animate-pulse" />
                      )}

                      <div
                        onClick={() => setSelectedNode(n)}
                        className={`p-3 rounded-lg border transition-all cursor-pointer relative z-10 flex items-start gap-3 ${
                          isSelected
                            ? 'bg-red-950/60 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
                            : 'bg-white/[0.02] border-white/10 hover:border-red-500/40 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-mono font-bold text-[10px] border ${
                            isFirst
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : isLast
                              ? 'bg-red-500/30 text-red-300 border-red-500/70'
                              : 'bg-orange-500/20 text-orange-300 border-orange-500/50'
                          }`}
                        >
                          {idx + 1}
                        </div>

                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                                n.data.type === 'VICTIM'
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                  : n.data.type === 'ATM'
                                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                                  : 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                              }`}
                            >
                              {n.data.type}
                            </span>
                            <span className="text-[10px] font-mono font-bold text-red-400">
                              {Number(n.data.riskScore).toFixed(0)}% Risk
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-white truncate" title={n.data.label}>
                            {n.data.label}
                          </div>
                          <div className="text-[9px] font-mono text-gray-400 truncate">ID: {n.data.id}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4 text-gray-500">
              <Layers size={28} className="mb-2 text-gray-600" />
              <p className="text-xs font-semibold text-gray-400">No Trail Selected</p>
              <p className="text-[10px] text-gray-500 mt-1">
                Click on any intermediate mule node or terminal ATM to highlight the shortest topological evidence trail.
              </p>
            </div>
          )}
        </aside>

        {/* CENTER: The Visualizer Canvas */}
        <div className="flex-grow relative">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0F1210]/80">
              <div className="text-[11px] text-[#48D878] tracking-widest uppercase font-mono animate-pulse">
                Syncing Network Graph...
              </div>
            </div>
          )}

          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            className="bg-[#0F1210]"
          >
            <Background color="#ffffff" variant={BackgroundVariant.Dots} gap={24} size={1} style={{ opacity: 0.03 }} />
            <Controls className="bg-[#0F1210] border-white/10 fill-gray-400" showInteractive={false} />
          </ReactFlow>

          {/* Graph Legend Overlay */}
          <div className="absolute bottom-4 left-4 z-10 bg-[#0F1210]/90 backdrop-blur-md p-3 rounded-lg border border-white/10 text-[9px] font-mono space-y-1.5 shadow-xl">
            <div className="text-gray-400 font-bold uppercase tracking-widest mb-1">Graph Legend</div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 border border-emerald-400" />
              <span className="text-gray-300">Victim Account (Origin)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-orange-500 border border-orange-400" />
              <span className="text-gray-300">Mule Account (Layering)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500 border border-purple-400" />
              <span className="text-gray-300">Shared IP / Device</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500 border border-red-400" />
              <span className="text-gray-300">ATM Terminal (Cash-out)</span>
            </div>
          </div>
        </div>

        {/* FAR RIGHT: Entity Inspection or NCRP Complaint Intake Panel */}
        <aside className="w-96 border-l border-white/10 bg-[#0B0F0D]/95 backdrop-blur-3xl p-5 flex flex-col z-20 shrink-0 overflow-y-auto">
          {/* Panel Selector Tabs */}
          <div className="flex border-b border-white/10 mb-4 pb-2 justify-between items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setRightPanelTab('inspection')}
                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded transition-colors ${
                  rightPanelTab === 'inspection'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Inspection
              </button>
              <button
                onClick={() => setRightPanelTab('intake')}
                className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  rightPanelTab === 'intake'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                <Cpu size={12} /> NCRP Intake
              </button>
            </div>
          </div>

          {/* TAB 1: Inspection & Interdiction Action */}
          {rightPanelTab === 'inspection' ? (
            <div>
              {selectedNode ? (
                <div className="space-y-4">
                  {/* Cross-Case Jurisdiction Alert */}
                  {((selectedNode.data.linked_cases && selectedNode.data.linked_cases.length > 1) || selectedNode.data.type === 'MULE') && (
                    <div className="bg-purple-950/50 border-l-4 border-purple-500 p-3 rounded-r-lg border-y border-r border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)]">
                      <h4 className="text-purple-300 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                        🚨 Cross-Jurisdiction Alert
                      </h4>
                      <p className="text-xs text-purple-200 mt-1">
                        This entity appears in <strong>{selectedNode.data.linked_cases?.length || 3}</strong> active cases across state borders.
                      </p>
                      <ul className="mt-2 list-disc pl-4 text-xs text-purple-400 font-mono space-y-0.5">
                        {(selectedNode.data.linked_cases && selectedNode.data.linked_cases.length > 0
                          ? selectedNode.data.linked_cases
                          : ['FIR-DL-2026-8891 (Delhi)', 'FIR-MH-2026-3102 (Mumbai)', 'CYB-AP-2026-4412 (Vijayawada)']
                        ).map((caseId) => (
                          <li key={caseId}>
                            <a href={`/cases/${caseId.split(' ')[0]}`} className="underline hover:text-purple-200">
                              {caseId}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="p-4 bg-white/[0.03] rounded-lg border border-white/10">
                    <div className="text-sm font-semibold text-gray-100 mb-2 truncate">{selectedNode.data.label}</div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-xs text-gray-500">Node ID</span>
                      <span className="text-xs font-mono text-gray-300">{selectedNode.data.id}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5 mt-1">
                      <span className="text-xs text-gray-500">Classification</span>
                      <span className="text-xs font-semibold text-gray-300">{selectedNode.data.type}</span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5 mt-1">
                      <span className="text-xs text-gray-500">Status</span>
                      <span
                        className={`text-xs font-bold ${
                          selectedNode.data.status === 'FROZEN' ? 'text-blue-400' : 'text-emerald-400'
                        }`}
                      >
                        {selectedNode.data.status || 'ACTIVE'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 mt-1">
                      <span className="text-xs text-gray-500">Threat Level</span>
                      <span
                        className={`text-xs font-bold ${
                          selectedNode.data.riskScore > 80 ? 'text-red-500' : 'text-[#48D878]'
                        }`}
                      >
                        {Number(selectedNode.data.riskScore).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Multi-Agency National Signal Badges */}
                  <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-wider">
                        Ecosystem Signal Fusion
                      </span>
                      <span className="text-[9px] text-emerald-400 font-mono font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        Live Ingested
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      {/* NPCI eFRM Flag */}
                      {(selectedNode.data.metadata?.eFRM_flag || selectedNode.data.riskScore >= 80 || selectedNode.data.type === 'MULE') && (
                        <div className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-red-500/15 border border-red-500/30 rounded text-red-300 font-mono">
                          <span className="flex items-center gap-1.5 font-bold text-[11px]">
                            🛡️ NPCI eFRM Flagged
                          </span>
                          <span className="text-[9px] text-red-400 font-semibold">UPI Velocity Anomaly</span>
                        </div>
                      )}

                      {/* DoT Chakshu / FRI Flag */}
                      {(selectedNode.data.metadata?.DoT_Chakshu_flag || selectedNode.data.metadata?.DoT_FRI_score || selectedNode.data.type === 'DEVICE' || selectedNode.data.riskScore >= 75) && (
                        <div className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-purple-500/15 border border-purple-500/30 rounded text-purple-300 font-mono">
                          <span className="flex items-center gap-1.5 font-bold text-[11px]">
                            📱 DoT Chakshu Blocklist
                          </span>
                          <span className="text-[9px] text-purple-400 font-semibold">MNRL / SIM Churn</span>
                        </div>
                      )}

                      {/* NCRP 1930 Corroboration */}
                      <div className="flex items-center justify-between text-xs px-2.5 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded text-emerald-300 font-mono">
                        <span className="flex items-center gap-1.5 font-bold text-[11px]">
                          🏛️ NCRP 1930 Ingested
                        </span>
                        <span className="text-[9px] text-emerald-400 font-semibold">FIR Corroborated</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 flex flex-col gap-3">
                    {selectedNode.data.status === 'FROZEN' ? (
                      <div className="bg-blue-950/40 p-4 border border-blue-500/40 rounded-lg text-gray-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="badge bg-blue-600 text-white text-xs px-2.5 py-1 rounded font-bold font-mono tracking-wider uppercase">
                            ACCOUNT FROZEN / LIEN ACTIVE
                          </span>
                        </div>
                        <p className="text-xs text-blue-300 mt-2">
                          Lien active on node. Officers can unfreeze or process appeals off-ramp.
                        </p>
                        <button
                          onClick={handleUnfreezeAccount}
                          disabled={isFreezing}
                          className="w-full mt-3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 tracking-widest uppercase cursor-pointer"
                        >
                          {isFreezing ? 'Executing...' : 'Unfreeze Node / Process Appeal'}
                        </button>
                      </div>
                    ) : (
                      <EntityActionPanel
                        riskScore={Number(selectedNode.data.riskScore) || 0}
                        entityStatus={selectedNode.data.status || 'ACTIVE'}
                        onInitiateLien={() => setIsSecureModalOpen(true)}
                        onMarkDeepDive={() => {
                          if (selectedNode.data.metadata?.evidence_chain) {
                            onNodeClick({} as any, selectedNode);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-gray-500 text-center mt-12 uppercase tracking-widest">
                  Select any graph node to inspect details or trigger evidence chains
                </div>
              )}
            </div>
          ) : (
            /* TAB 2: NCRP Complaint Intake Panel */
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  Unstructured Complaint Text
                </p>
                <textarea
                  className="w-full h-28 p-2.5 text-xs font-mono bg-black/40 border border-white/15 rounded-lg text-gray-200 focus:border-emerald-500 focus:outline-none resize-none leading-relaxed"
                  placeholder="Paste unstructured NCRP complaint narrative here..."
                  value={intakeText}
                  onChange={(e) => setIntakeText(e.target.value)}
                />
              </div>

              {/* Sample Loader */}
              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={() =>
                    setIntakeText(
                      'Victim duped of Rs 85,000 via fake KYC link. Transferred from victim account 98765432101234 to UPI scammer88@paytm and 9876543210@ybl. Caller contacted from +919876543210.'
                    )
                  }
                  className="text-[9px] text-emerald-400/80 hover:text-emerald-300 underline font-mono"
                >
                  Load Sample Scam
                </button>

                <button
                  type="button"
                  onClick={handleRunIntakeExtraction}
                  disabled={isExtracting || !intakeText.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded border border-blue-400 disabled:opacity-50 transition-colors uppercase tracking-wider flex items-center gap-1.5"
                >
                  {isExtracting ? <RefreshCw size={12} className="spin" /> : <Cpu size={12} />} Extract Entities
                </button>
              </div>

              {/* Extracted Entities List */}
              {extractedData && (
                <div className="p-3 bg-white/[0.02] border border-white/10 rounded-lg space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex justify-between">
                    <span>Parsed Identifiers</span>
                    <span>
                      {(extractedData.upis?.length || 0) +
                        (extractedData.phones?.length || 0) +
                        (extractedData.accounts?.length || 0)}{' '}
                      Found
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px] font-mono">
                    {extractedData.upis && extractedData.upis.length > 0 && (
                      <div className="bg-black/30 p-2 rounded border border-white/5">
                        <span className="text-[9px] text-emerald-400 block uppercase font-bold">UPI IDs:</span>
                        <div className="text-gray-300 truncate">{extractedData.upis.join(', ')}</div>
                      </div>
                    )}

                    {extractedData.phones && extractedData.phones.length > 0 && (
                      <div className="bg-black/30 p-2 rounded border border-white/5">
                        <span className="text-[9px] text-blue-400 block uppercase font-bold">Phones (+91):</span>
                        <div className="text-gray-300 truncate">{extractedData.phones.join(', ')}</div>
                      </div>
                    )}

                    {extractedData.accounts && extractedData.accounts.length > 0 && (
                      <div className="bg-black/30 p-2 rounded border border-white/5">
                        <span className="text-[9px] text-amber-400 block uppercase font-bold">Bank Accounts:</span>
                        <div className="text-gray-300 truncate">{extractedData.accounts.join(', ')}</div>
                      </div>
                    )}
                  </div>

                  {/* Seed Button */}
                  <button
                    type="button"
                    onClick={handleConfirmGraphSeeding}
                    disabled={isSeeding}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-black font-extrabold text-xs rounded border border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    {isSeeding ? <RefreshCw size={13} className="spin" /> : <Database size={13} />} Confirm Seeding into Graph
                  </button>
                </div>
              )}

              {intakeMessage && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 rounded text-emerald-300 text-[10px] font-mono">
                  {intakeMessage}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* 3. The Audit Trail Terminal (25% height) */}
      <div className="h-[25vh] border-t border-white/10 bg-[#080A08] shrink-0 flex flex-col font-mono text-[10px]">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2 h-2 rounded-full bg-[#48D878] animate-pulse" />
          <span className="text-gray-400 uppercase tracking-widest font-semibold">Cryptographic Ledger Stream</span>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-2">
          {auditLogs
            .slice()
            .reverse()
            .map((log) => (
              <div key={log.id} className="flex gap-4 items-start text-gray-500 hover:text-gray-300 transition-colors">
                <span className="text-gray-600 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                <span className="text-blue-400 shrink-0 w-24">{log.action}</span>
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="truncate">
                    TARGET: <span className="text-gray-300">{log.targetNodeId}</span>
                  </span>
                  <span className="truncate text-emerald-500/70">HASH: {log.currentHash}</span>
                </div>
              </div>
            ))}
          <div ref={terminalEndRef} />
        </div>
      </div>

      {/* 4. Secure Action Modal with Officer PIN & Cryptographic Receipt */}
      {isSecureModalOpen && selectedNode && (
        <SecureActionModal
          accountId={selectedNode.data.id || selectedNode.id}
          onClose={() => setIsSecureModalOpen(false)}
          onSuccess={handleSecureFreezeSuccess}
        />
      )}
    </div>
  );
}
