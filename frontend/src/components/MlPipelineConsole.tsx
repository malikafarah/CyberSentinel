import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Play, Square, Sparkles, Copy, Trash2 } from 'lucide-react';

interface MlPipelineConsoleProps {
  onComplete?: () => void;
  className?: string;
}

export default function MlPipelineConsole({ onComplete, className = '' }: MlPipelineConsoleProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED' | 'ERROR'>('IDLE');
  const eventSourceRef = useRef<EventSource | null>(null);
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when logs are added
  useEffect(() => {
    terminalBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Clean up SSE connection on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const stopPipeline = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const startPipeline = () => {
    if (isRunning) return;

    // Reset state and show initial connecting message
    setIsRunning(true);
    setStatus('RUNNING');
    setLogs(['System: Initializing ML Pipeline connection...']);

    try {
      const sseUrl = '/api/v1/engine/stream-pipeline';
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        let msg = event.data;
        if (typeof msg !== 'string') {
          try {
            msg = JSON.stringify(msg);
          } catch {
            msg = String(msg);
          }
        }

        // Try parsing JSON payload if sent as structured event
        try {
          const parsed = JSON.parse(msg);
          if (parsed.message) {
            msg = `[${parsed.status || 'INFO'}] ${parsed.message}`;
          }
        } catch {
          // Plain text log line
        }

        setLogs((prev) => [...prev, msg]);

        // Detect completion signal
        if (
          msg.includes('[SUCCESS]') ||
          msg.includes('Pipeline execution complete') ||
          msg.includes('SYSTEM READY') ||
          msg.includes('DONE')
        ) {
          setStatus('COMPLETED');
          stopPipeline();
          if (onComplete) onComplete();
        }
      };

      eventSource.onerror = () => {
        setLogs((prev) => [...prev, '[ERROR] SSE connection error or stream terminated.']);
        setStatus('ERROR');
        stopPipeline();
      };
    } catch (err: any) {
      setLogs((prev) => [...prev, `[ERROR] Failed to establish SSE stream: ${err?.message || 'Unknown error'}`]);
      setStatus('ERROR');
      setIsRunning(false);
    }
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
  };

  const clearLogs = () => {
    if (isRunning) return;
    setLogs([]);
    setStatus('IDLE');
  };

  return (
    <div
      className={`rounded-xl border border-white/15 bg-[#0A0D0B] text-gray-200 overflow-hidden shadow-2xl flex flex-col font-mono ${className}`}
    >
      {/* Console Header Bar */}
      <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <Terminal size={16} className="text-[#48D878]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">
            ML Intelligence Pipeline Console
          </h3>
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-widest ${
              status === 'RUNNING'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                : status === 'COMPLETED'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : status === 'ERROR'
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            {status}
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <>
              <button
                type="button"
                onClick={copyLogs}
                title="Copy Terminal Logs"
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 text-[11px] rounded border border-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Copy size={12} /> Copy
              </button>
              <button
                type="button"
                onClick={clearLogs}
                disabled={isRunning}
                title="Clear Logs"
                className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-400 text-[11px] rounded border border-white/10 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Trash2 size={12} /> Clear
              </button>
            </>
          )}

          {isRunning ? (
            <button
              type="button"
              onClick={stopPipeline}
              className="px-4 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold rounded border border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] flex items-center gap-1.5 cursor-pointer uppercase tracking-wider transition-colors"
            >
              <Square size={12} /> Abort Pipeline
            </button>
          ) : (
            <button
              type="button"
              onClick={startPipeline}
              disabled={isRunning}
              className="px-4 py-1.5 bg-[#48D878] hover:bg-[#3ec46a] text-black text-xs font-extrabold rounded border border-[#48D878] shadow-[0_0_15px_rgba(72,216,120,0.3)] flex items-center gap-1.5 cursor-pointer uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              <Play size={12} /> Execute Pipeline
            </button>
          )}
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="p-4 bg-black/70 min-h-[260px] max-h-[420px] overflow-y-auto text-xs font-mono space-y-1.5 leading-relaxed selection:bg-emerald-500/30">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-center">
            <Sparkles size={24} className="mb-2 text-gray-600" />
            <p className="text-gray-400">Pipeline Idle</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Click &apos;Execute Pipeline&apos; to trigger live Server-Sent Events (SSE) log streaming.
            </p>
          </div>
        ) : (
          logs.map((log, index) => {
            const isSuccess = log.includes('[SUCCESS]') || log.includes('complete');
            const isError = log.includes('[ERROR]') || log.includes('failed');
            const isSystem = log.startsWith('System:');
            const isInfo = log.includes('[INFO]');

            let colorClass = 'text-gray-300';
            if (isSuccess) colorClass = 'text-[#48D878] font-bold';
            else if (isError) colorClass = 'text-red-400 font-bold';
            else if (isSystem) colorClass = 'text-emerald-400 font-semibold';
            else if (isInfo) colorClass = 'text-emerald-300/90';

            return (
              <div key={index} className={`flex items-start gap-2 ${colorClass} break-all hover:bg-white/[0.02] px-1 py-0.5 rounded`}>
                <span className="text-gray-600 select-none shrink-0 w-6 text-right">{index + 1}</span>
                <span className="shrink-0">{isSuccess ? '✔' : isError ? '✖' : '>'}</span>
                <span className="flex-1">{log}</span>
              </div>
            );
          })
        )}
        <div ref={terminalBottomRef} />
      </div>

      {/* Footer Telemetry Status */}
      <div className="px-4 py-2 bg-white/[0.02] border-t border-white/10 flex justify-between items-center text-[10px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-[#48D878] animate-pulse' : 'bg-gray-600'}`} />
          {isRunning ? 'SSE CHANNEL ACTIVE (/api/v1/engine/stream-pipeline)' : 'CHANNEL DISCONNECTED'}
        </span>
        <span>{logs.length} Log Lines Streamed</span>
      </div>
    </div>
  );
}
