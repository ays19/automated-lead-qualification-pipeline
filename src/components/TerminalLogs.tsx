import React, { useEffect, useRef } from "react";
import { Terminal, ShieldCheck, Play, RefreshCw, Trash2 } from "lucide-react";

interface TerminalLogsProps {
  logs: string[];
  isSearching: boolean;
  onClear: () => void;
}

export default function TerminalLogs({ logs, isSearching, onClear }: TerminalLogsProps) {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  return (
    <div id="terminal-container" className="flex flex-col bg-black border border-slate-200 dark:border-[#262626] rounded-sm overflow-hidden shadow-none h-[420px] font-mono text-xs text-slate-300">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 dark:bg-[#141414] border-b border-slate-800 dark:border-[#262626]">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/80 block"></span>
            <span className="w-3 h-3 rounded-full bg-yellow-500/80 block"></span>
            <span className="w-3 h-3 rounded-full bg-green-500/80 block"></span>
          </div>
          <span className="text-slate-400 font-medium ml-2 text-[11px] flex items-center gap-1.5">
            <Terminal size={12} className="text-emerald-400" />
            pipeline_runner_daemon.sh
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {isSearching && (
            <span className="flex items-center gap-1.5 text-amber-400 text-[10px] animate-pulse">
              <RefreshCw size={10} className="animate-spin" />
              RUNNING PIPELINE
            </span>
          )}
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 transition-all"
            title="Clear Terminal Logs"
            id="clear-logs-btn"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Terminal Output Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5 leading-relaxed selection:bg-emerald-500/30">
        {logs.length === 0 && !isSearching ? (
          <div className="flex flex-col text-slate-600 font-mono text-xs space-y-1 mt-2">
            <div>&gt; Awaiting pipeline execution.</div>
            <div>
              &gt; Configure ICP above and click Run Pipeline to begin.<span className="animate-pulse">▋</span>
            </div>
          </div>
        ) : (
          logs.map((log, index) => {
            let textColor = "text-slate-300";
            if (log.includes("[!]")) {
              textColor = "text-amber-400";
            } else if (log.includes("[FATAL ERROR]") || log.includes("failed")) {
              textColor = "text-red-400 font-semibold";
            } else if (log.includes("completed successfully") || log.includes("Successfully") || log.includes("Done")) {
              textColor = "text-emerald-400 font-semibold";
            } else if (log.includes("Score:") || log.includes("Result ->")) {
              textColor = "text-cyan-400";
            } else if (log.includes("[*]") || log.includes("Starting")) {
              textColor = "text-blue-400";
            }

            return (
              <div key={index} className={`whitespace-pre-wrap transition-all duration-150 ${textColor}`}>
                {log}
              </div>
            );
          })
        )}
        {isSearching && (
          <div className="flex items-center space-x-1 text-emerald-400 font-semibold animate-pulse mt-2">
            <span className="w-1.5 h-3 bg-emerald-400 animate-caret"></span>
            <span>Pipeline active... compiling results</span>
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
