import React, { useState } from "react";
import { Table, Search, Mail, ExternalLink, Download, FileSpreadsheet, ArrowUpDown, ChevronRight, ChevronDown, RefreshCw, AlertCircle, Trash2 } from "lucide-react";
import { OutputLead } from "../types";

interface LeadTableProps {
  leads: OutputLead[];
  onStatusChange: (profileLink: string, newStatus: string) => void;
  onViewEmail: (lead: OutputLead) => void;
  isLoading: boolean;
  onDeleteLead: (profileLink: string) => void;
}

type SortField = "Candidate Name" | "Calculated Fit Score" | "Status";
type SortOrder = "asc" | "desc";

export default function LeadTable({
  leads,
  onStatusChange,
  onViewEmail,
  isLoading,
  onDeleteLead,
}: LeadTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("Calculated Fit Score");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleExpand = (url: string) => {
    setExpandedRows((prev) => ({ ...prev, [url]: !prev[url] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  // Filter and sort leads
  const processedLeads = leads
    .filter((lead) => {
      const name = (lead["Candidate Name"] || "").toLowerCase();
      const justification = (lead.Justification || "").toLowerCase();
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || justification.includes(searchTerm.toLowerCase());
      
      const status = (lead.Status || "").toLowerCase();
      const matchesStatus = statusFilter === "all" || status === statusFilter.toLowerCase();
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Score parsing as integer
      if (sortField === "Calculated Fit Score") {
        valA = parseInt(String(valA), 10) || 0;
        valB = parseInt(String(valB), 10) || 0;
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

  const getScoreColor = (scoreStr: string | number) => {
    const score = parseInt(String(scoreStr), 10) || 0;
    if (score >= 85) return { bg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/30", bar: "bg-emerald-400" };
    if (score >= 75) return { bg: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-500/30", bar: "bg-[#3B82F6]" };
    if (score >= 50) return { bg: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/30", bar: "bg-amber-400" };
    return { bg: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/30", bar: "bg-rose-500" };
  };

  return (
    <div id="lead-table-component" className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm overflow-hidden shadow-none flex flex-col">
      {/* Table Filters Header */}
      <div className="p-5 border-b border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-3 max-w-md">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={15} />
            <input
              type="text"
              placeholder="Search qualified leads, justifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white rounded-sm text-xs outline-none focus:border-[#3B82F6] transition-all font-mono"
              id="lead-search-input"
            />
          </div>

          {/* Status selector filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="p-2 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] text-slate-900 dark:text-white rounded-sm text-xs outline-none focus:border-[#3B82F6] transition-all cursor-pointer font-mono font-bold uppercase tracking-wider"
            id="lead-status-filter"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {/* Export / Count indicators */}
        <div className="flex items-center gap-3 font-mono">
          <span className="text-[11px] text-slate-400 uppercase tracking-wide">
            Found <strong className="text-slate-900 dark:text-white font-bold">{processedLeads.length}</strong> // total: {leads.length} leads
          </span>

          <button
            onClick={() => {
              const headers = ["Candidate Name", "Profile Link", "Calculated Fit Score", "Justification", "Generated Personalized Outreach Text", "Status"];
              const escapeField = (val: any) => {
                if (val === null || val === undefined) return "";
                const str = String(val);
                if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) return `"${str.replace(/"/g, '""')}"`;
                return str;
              };
              const headerLine = headers.join(",");
              const rows = leads.map((row) => headers.map((header) => escapeField(row[header as keyof OutputLead])).join(","));
              const blob = new Blob([[headerLine, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.setAttribute("download", `qualified_cold_leads_${new Date().toISOString().split("T")[0]}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            disabled={leads.length === 0}
            className="px-4 py-2 bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] disabled:opacity-50 disabled:cursor-not-allowed rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
            title="Download CSV format"
            id="export-csv-btn"
          >
            <Download size={14} />
            CSV
          </button>

          <button
            onClick={() => window.open('/api/leads/export-excel', '_blank')}
            disabled={leads.length === 0}
            className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-[#1C1C1C] disabled:text-slate-400 dark:disabled:text-slate-600 text-black rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
            title="Download Microsoft Excel sheet"
            id="export-excel-btn"
          >
            <FileSpreadsheet size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Grid Canvas Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 font-mono">
            <RefreshCw size={30} className="animate-spin text-[#3B82F6]" />
            <p className="text-xs uppercase tracking-wider">Refreshing lead outreach logs from disk...</p>
          </div>
        ) : processedLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 font-mono">
            <AlertCircle size={32} className="text-slate-600" />
            <p className="text-xs uppercase tracking-wider">No records found matching filters.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse min-w-[900px] text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-black border-b border-slate-200 dark:border-[#262626] text-[10px] uppercase font-bold text-[#3B82F6] tracking-widest">
                <th className="py-3 px-5 select-none cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1C1C1C] transition-all" onClick={() => handleSort("Candidate Name")}>
                  <span className="flex items-center gap-1.5">
                    Candidate & Profile Link
                    <ArrowUpDown size={11} className="text-[#3B82F6]" />
                  </span>
                </th>
                <th className="py-3 px-5 select-none cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1C1C1C] transition-all w-32" onClick={() => handleSort("Calculated Fit Score")}>
                  <span className="flex items-center gap-1.5">
                    Calculated Fit Score
                    <ArrowUpDown size={11} className="text-[#3B82F6]" />
                  </span>
                </th>
                <th className="py-3 px-5 w-80">Justification (Why they scored)</th>
                <th className="py-3 px-5 w-44">Outreach Preparation</th>
                <th className="py-3 px-5 select-none cursor-pointer hover:bg-slate-200 dark:hover:bg-[#1C1C1C] transition-all w-36" onClick={() => handleSort("Status")}>
                  <span className="flex items-center gap-1.5">
                    Outreach Status
                    <ArrowUpDown size={11} className="text-[#3B82F6]" />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-[#262626] text-slate-700 dark:text-slate-300 bg-white dark:bg-[#141414]">
              {processedLeads.map((lead, index) => {
                const name = lead["Candidate Name"] || "Unknown";
                const profileUrl = lead["Profile Link"] || "";
                const score = lead["Calculated Fit Score"] || 0;
                const justification = lead.Justification || "No justification provided.";
                const emailText = lead["Generated Personalized Outreach Text"] || "";
                const status = lead.Status || "Pending";

                const scoreColor = getScoreColor(score);
                const hasEmail = emailText && !emailText.startsWith("N/A");

                return (
                  <tr key={index} className="hover:bg-slate-50 dark:hover:bg-[#1C1C1C] transition-colors group">
                    {/* Candidate Name & Link */}
                    <td className="py-4 px-5">
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{name}</div>
                      {profileUrl && (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#3B82F6] hover:underline inline-flex items-center gap-0.5 mt-1 font-mono"
                        >
                          LinkedIn Profile
                          <ExternalLink size={8} />
                        </a>
                      )}
                    </td>

                    {/* Calculated Fit Score (1-100) */}
                    <td className="py-4 px-5">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between font-mono text-[11px]">
                          <span className={`px-2 py-0.5 rounded-sm border text-[10px] font-bold ${scoreColor.bg}`}>
                            {score} / 100
                          </span>
                        </div>
                        {/* Interactive mini progress bar */}
                        <div className="w-full bg-slate-200 dark:bg-[#262626] h-1 rounded-sm overflow-hidden">
                          <div className={`${scoreColor.bar} h-full rounded-sm transition-all duration-500`} style={{ width: `${score}%` }}></div>
                        </div>
                      </div>
                    </td>

                    {/* Justification Text */}
                    <td className="py-4 px-5 text-slate-500 dark:text-slate-400 font-mono text-[11px] leading-relaxed max-w-xs align-top">
                      {(() => {
                        const isExpanded = !!expandedRows[profileUrl];
                        const isLong = justification.length > 60;
                        
                        if (isExpanded) {
                          const parts = justification.split("|").map(p => p.trim()).filter(Boolean);
                          return (
                            <div className="relative pr-6">
                              <div className="space-y-1">
                                {parts.map((part, idx) => (
                                  <div key={idx}>&middot; {part}</div>
                                ))}
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleExpand(profileUrl); }}
                                className="absolute top-0 right-0 p-0.5 hover:bg-slate-200 dark:hover:bg-[#262626] rounded-sm transition-all"
                              >
                                <ChevronDown size={14} className="transform rotate-180 transition-transform text-[#3B82F6]" />
                              </button>
                            </div>
                          );
                        }
                        
                        return (
                          <div className="relative pr-6">
                            <span>{isLong ? `${justification.substring(0, 60)}...` : justification}</span>
                            {isLong && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); toggleExpand(profileUrl); }}
                                className="absolute top-0 right-0 p-0.5 hover:bg-slate-200 dark:hover:bg-[#262626] rounded-sm transition-all"
                              >
                                <ChevronDown size={14} className="transform rotate-0 transition-transform text-[#3B82F6]" />
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Generated Personalized Outreach */}
                    <td className="py-4 px-5">
                      {hasEmail ? (
                        <button
                          onClick={() => onViewEmail(lead)}
                          className="px-3 py-1.5 bg-slate-50 dark:bg-black text-[#3B82F6] hover:bg-slate-200 dark:hover:bg-[#202020] border border-slate-200 dark:border-[#262626] hover:border-[#3B82F6] rounded-sm font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all text-[10px] cursor-pointer"
                          id={`view-email-btn-${index}`}
                        >
                          <Mail size={12} />
                          Outreach
                          <ChevronRight size={10} className="text-[#3B82F6]" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 font-mono uppercase tracking-wide">BELOW THRESHOLD</span>
                      )}
                    </td>

                    {/* Outreach Status */}
                    <td className="py-4 px-5">
                      <div className="flex items-center gap-2">
                        {!hasEmail ? (
                          <div
                            className="p-1.5 border rounded-sm text-[10px] font-bold font-mono uppercase tracking-wider bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/40 opacity-70 cursor-not-allowed select-none"
                            title="Below qualification threshold — status locked. Adjust the threshold in Pipeline Config to reconsider this candidate."
                            id={`status-locked-${index}`}
                          >
                            Rejected
                          </div>
                        ) : (
                          <select
                            value={status}
                            onChange={(e) => onStatusChange(profileUrl, e.target.value)}
                            className={`p-1.5 border rounded-sm text-[10px] font-bold outline-none cursor-pointer font-mono uppercase tracking-wider transition-all ${
                              status === "Pending"
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-500/40"
                                : status === "Sent"
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-500/40"
                                : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-300 dark:border-rose-500/40"
                            }`}
                            id={`status-select-${index}`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Sent">Sent</option>
                            <option value="Rejected">Rejected</option>
                          </select>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete ${name} from Qualified Lead Records?`)) {
                              onDeleteLead(profileUrl);
                            }
                          }}
                          className="p-1.5 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black hover:bg-slate-100 dark:hover:bg-[#1C1C1C] hover:border-red-500/50 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-sm transition-all cursor-pointer flex items-center justify-center"
                          title="Delete Lead Record"
                          id={`delete-lead-btn-${index}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
