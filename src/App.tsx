import React, { useState, useEffect } from "react";
import {
  FileText,
  Sliders,
  Sparkles,
  Play,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  ArrowRight,
  Code,
  Check,
  Copy,
  Mail,
  Edit2,
  Trash2,
  BookOpen,
  Info,
  Settings,
  Plus,
  Download,
  UploadCloud,
  ExternalLink,
  Sun,
  Moon
} from "lucide-react";
import TerminalLogs from "./components/TerminalLogs";
import OutreachEmailModal from "./components/OutreachEmailModal";
import CandidateDialog from "./components/CandidateDialogs";
import LeadTable from "./components/LeadTable";
import { InputLead, OutputLead, RuleWeights, PipelineMode } from "./types";

const DEFAULT_ICP = (
  "Recent 2025/2026 Civil, Mechanical, Structural, Project Management, " +
  "or Construction Management Engineering graduates in the US seeking entry-level roles, " +
  "ideally with AutoCAD exposure, who could pivot into Telecom/OSP engineering."
);

const DEFAULT_WEIGHTS: RuleWeights = {
  education: 35,
  grad_year: 25,
  skills: 25,
  location_us: 15,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "database" | "logs" | "script">("dashboard");

  // Dark/Light Theme state
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("qual01-theme");
    return saved === "light" ? "light" : "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("qual01-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  // Core configuration states
  const [icp, setIcp] = useState(DEFAULT_ICP);
  const [mode, setMode] = useState<PipelineMode>("ai");
  const [threshold, setThreshold] = useState(75);
  const [weights, setWeights] = useState<RuleWeights>(DEFAULT_WEIGHTS);
  const [icpDirty, setIcpDirty] = useState(false);

  // Leads data states
  const [inputLeads, setInputLeads] = useState<InputLead[]>([]);
  const [outputLeads, setOutputLeads] = useState<OutputLead[]>([]);
  const [pipelinePyCode, setPipelinePyCode] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  // Interactive UI indicators
  const [isLoadingInputs, setIsLoadingInputs] = useState(false);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  
  // Modals state
  const [selectedEmailLead, setSelectedEmailLead] = useState<OutputLead | null>(null);
  const [dialogCandidate, setDialogCandidate] = useState<InputLead | null>(null);
  const [isCandidateDialogOpen, setIsCandidateDialogOpen] = useState(false);

  // Toast notice
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [groqConfigured, setGroqConfigured] = useState<boolean>(false);
  const [apifyConfigured, setApifyConfigured] = useState<boolean>(false);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [ingestMethod, setIngestMethod] = useState<"csv" | "paste">("csv");
  const [pastedUrls, setPastedUrls] = useState<string>("");
  const [isScrapingUrls, setIsScrapingUrls] = useState<boolean>(false);

  const downloadTemplate = () => {
    const headers = ["LinkedIn URL", "Name", "Headline", "Education", "Graduation Year", "Skills", "Location", "Summary/Bio"];
    const exampleRow = ["https://www.linkedin.com/in/john-doe", "John Doe", "Civil Engineering Graduate | AutoCAD Enthusiast", "B.S. in Civil Engineering - Texas A&M", "2025", "AutoCAD, Civil3D, GIS", "Dallas, TX, USA", "Eager to start my career in telecom infrastructure."];
    const csvContent = [headers.join(","), exampleRow.map(v => `"${v.replace(/"/g, '""')}"`).join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", "leads_upload_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const parseCSVClient = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let currentToken = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentToken += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        row.push(currentToken.trim());
        currentToken = "";
      } else if ((char === "\r" || char === "\n") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") i++;
        row.push(currentToken.trim());
        if (row.length > 0 && (row.length > 1 || row[0] !== "")) {
          lines.push(row);
        }
        currentToken = "";
        row = [];
      } else {
        currentToken += char;
      }
    }
    if (currentToken !== "" || row.length > 0) {
      row.push(currentToken.trim());
      lines.push(row);
    }
    return lines;
  };

  const processCSVLeads = (lines: string[][]): Record<string, string>[] => {
    if (lines.length === 0) return [];
    
    const headers = lines[0].map(h => h.trim().replace(/^\uFEFF/, ""));
    const urlIdx = headers.findIndex(h => h.toLowerCase() === "linkedin url" || h.toLowerCase() === "profile link" || h.toLowerCase() === "url");
    if (urlIdx === -1) {
      throw new Error("Missing required column: LinkedIn URL");
    }

    const nameIdx = headers.findIndex(h => h.toLowerCase() === "name" || h.toLowerCase() === "candidate name");
    const headlineIdx = headers.findIndex(h => h.toLowerCase() === "headline" || h.toLowerCase() === "title" || h.toLowerCase() === "position");
    const eduIdx = headers.findIndex(h => h.toLowerCase() === "education" || h.toLowerCase() === "education background");
    const gradIdx = headers.findIndex(h => h.toLowerCase() === "graduation year" || h.toLowerCase() === "grad year" || h.toLowerCase() === "graduation");
    const skillsIdx = headers.findIndex(h => h.toLowerCase() === "skills");
    const locIdx = headers.findIndex(h => h.toLowerCase() === "location");
    const bioIdx = headers.findIndex(h => h.toLowerCase() === "summary/bio" || h.toLowerCase() === "about" || h.toLowerCase() === "bio" || h.toLowerCase() === "summary");

    const processed: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

      const url = row[urlIdx] || "";
      if (!url.trim()) continue;

      processed.push({
        "LinkedIn URL": url,
        "Name": nameIdx !== -1 ? row[nameIdx] || "" : "",
        "Headline": headlineIdx !== -1 ? row[headlineIdx] || "" : "",
        "Education": eduIdx !== -1 ? row[eduIdx] || "" : "",
        "Graduation Year": gradIdx !== -1 ? row[gradIdx] || "" : "2025",
        "Skills": skillsIdx !== -1 ? row[skillsIdx] || "" : "",
        "Location": locIdx !== -1 ? row[locIdx] || "" : "",
        "Summary/Bio": bioIdx !== -1 ? row[bioIdx] || "" : ""
      });
    }

    return processed;
  };

  const handleCSVUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      showToast("Only .csv files are supported!", "error");
      return;
    }
    if (file.size === 0) {
      showToast("Uploaded file is empty!", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = parseCSVClient(text);
        const parsedLeads = processCSVLeads(lines);

        if (parsedLeads.length === 0) {
          showToast("No valid leads found in CSV!", "error");
          return;
        }

        const res = await fetch("/api/leads/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: parsedLeads }),
        });

        if (res.ok) {
          showToast(`Imported ${parsedLeads.length} leads from ${file.name}`);
          fetchInputs();
        } else {
          throw new Error("Failed to save imported leads to server");
        }
      } catch (err: any) {
        showToast(err.message || "Error importing CSV file", "error");
      }
    };
    reader.readAsText(file);
  };

  const handleCSVFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCSVUpload(e.target.files[0]);
    }
  };

  const handleCSVDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleCSVUpload(e.dataTransfer.files[0]);
    }
  };

  const handlePasteScrape = async () => {
    if (!pastedUrls.trim()) return;

    // Split by comma or newline, trim, and filter out empty items
    const rawUrls = pastedUrls.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
    const uniqueUrls: string[] = Array.from(new Set(rawUrls));

    const validUrls: string[] = [];
    const invalidUrls: string[] = [];

    // Loose check to make sure it includes linkedin.com/in/
    const linkedinRegex = /linkedin\.com\/in\/[a-zA-Z0-9_-]+/i;

    uniqueUrls.forEach((url: string) => {
      if (linkedinRegex.test(url)) {
        validUrls.push(url);
      } else {
        invalidUrls.push(url);
      }
    });

    if (invalidUrls.length > 0) {
      showToast(`Skipped ${invalidUrls.length} invalid URL(s)`, "error");
      console.warn("Invalid LinkedIn URLs skipped:", invalidUrls);
    }

    if (validUrls.length === 0) {
      showToast("No valid LinkedIn profile URLs found!", "error");
      return;
    }

    setIsScrapingUrls(true);
    try {
      const res = await fetch("/api/leads/scrape-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: validUrls })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scraping failed");
      }

      const data = await res.json();
      if (data.success) {
        showToast(`Scraped and added ${data.scrapedCount} new lead(s)`);
        setPastedUrls("");
        fetchInputs();
      } else {
        throw new Error("Scraping finished but failed to save leads");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`Scraping failed: ${err.message}`, "error");
    } finally {
      setIsScrapingUrls(false);
    }
  };

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 1. Fetch initial records
  useEffect(() => {
    fetchInputs();
    fetchOutputs();
    fetchPipelineCode();
    fetchHealth();
  }, []);

  const fetchInputs = async () => {
    setIsLoadingInputs(true);
    try {
      const res = await fetch("/api/leads/input");
      const data = await res.json();
      setInputLeads(data.leads || []);
    } catch (err: any) {
      console.error("Error loading inputs: ", err);
    } finally {
      setIsLoadingInputs(false);
    }
  };

  const fetchOutputs = async () => {
    setIsLoadingOutputs(true);
    try {
      const res = await fetch("/api/leads/output");
      const data = await res.json();
      setOutputLeads(data.leads || []);
    } catch (err: any) {
      console.error("Error loading outputs: ", err);
    } finally {
      setIsLoadingOutputs(false);
    }
  };

  const fetchPipelineCode = async () => {
    try {
      const res = await fetch("/api/pipeline/code");
      const data = await res.json();
      setPipelinePyCode(data.code || "");
    } catch (err: any) {
      console.error("Error loading pipeline script: ", err);
    }
  };

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setGroqConfigured(!!data.groqConfigured);
      setApifyConfigured(!!data.apifyConfigured);
    } catch (err: any) {
      console.error("Error loading health status: ", err);
    }
  };

  // 2. Save modified input database back to server
  const saveInputLeads = async (updatedLeads: InputLead[]) => {
    try {
      const res = await fetch("/api/leads/input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: updatedLeads }),
      });
      if (res.ok) {
        setInputLeads(updatedLeads);
        showToast("Scraped database synchronized successfully");
      } else {
        throw new Error("Synchronization failure");
      }
    } catch (err: any) {
      showToast("Error synchronizing leads database", "error");
    }
  };

  // 3. Save modified output database back to server (status changes, email edits)
  const saveOutputLeads = async (updatedLeads: OutputLead[]) => {
    try {
      const res = await fetch("/api/leads/output", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads: updatedLeads }),
      });
      if (res.ok) {
        setOutputLeads(updatedLeads);
      } else {
        throw new Error("Failed to write outputs to disk");
      }
    } catch (err: any) {
      showToast("Error updating Microsoft Excel logs", "error");
    }
  };

  // 4. Run pipeline API trigger
  const handleRunPipeline = () => {
    if (isRunningPipeline) return;
    setIsRunningPipeline(true);
    setTerminalLogs([]);
    setActiveTab("dashboard");

    const queryParams = new URLSearchParams({
      mode,
      threshold: threshold.toString(),
      icp,
      weights: JSON.stringify(weights)
    }).toString();

    const eventSource = new EventSource(`/api/pipeline/run?${queryParams}`);

    eventSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setTerminalLogs((prev) => [...prev, msg]);
      } catch (err) {
        // ignore parse error
      }
    };

    eventSource.addEventListener("done", async (event) => {
      try {
        await fetchOutputs();
        showToast("Qualification pipeline completed successfully!");
        setIcpDirty(false);
      } catch (err) {
        showToast("Error updating pipeline results", "error");
      }
      setIsRunningPipeline(false);
      eventSource.close();
    });

    eventSource.onerror = (err) => {
      setTerminalLogs((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] [FATAL ERROR] Connection lost or pipeline failed.`,
      ]);
      showToast("Pipeline run encountered a fatal error", "error");
      setIsRunningPipeline(false);
      eventSource.close();
    };
  };

  // 5. Change individual lead status (Pending, Sent, Rejected)
  const handleStatusChange = async (profileLink: string, newStatus: string) => {
    const lead = outputLeads.find((l) => (l["Profile Link"] || "").toLowerCase().trim() === profileLink.toLowerCase().trim());
    if (!lead) return;

    if (newStatus === "Rejected") {
      const emailText = lead["Generated Personalized Outreach Text"] || "";
      const hasOutreachText = emailText && !emailText.startsWith("N/A");
      if (hasOutreachText) {
        const confirmed = window.confirm("Mark as Rejected?");
        if (!confirmed) {
          // Revert UI state
          setOutputLeads([...outputLeads]);
          return;
        }
      }
    }

    const previousLeads = [...outputLeads];
    const candidateName = lead["Candidate Name"] || "Candidate";

    // Optimistic UI update
    const updated = outputLeads.map((item) => {
      if ((item["Profile Link"] || "").toLowerCase().trim() === profileLink.toLowerCase().trim()) {
        return { ...item, Status: newStatus };
      }
      return item;
    });
    setOutputLeads(updated);

    try {
      const res = await fetch("/api/leads/output", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileLink,
          updates: { Status: newStatus }
        })
      });

      if (!res.ok) {
        throw new Error("Failed to update status on server");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Status update failed");
      }

      showToast(`Status updated for ${candidateName} to "${newStatus}"`);
    } catch (err: any) {
      console.error(err);
      setOutputLeads(previousLeads);
      showToast("Error updating status on server", "error");
    }
  };

  // 6. Save modified outreach email
  const handleEmailSave = async (newText: string) => {
    if (!selectedEmailLead) return;
    const profileLink = selectedEmailLead["Profile Link"];
    const previousLeads = [...outputLeads];
    const previousSelected = { ...selectedEmailLead };

    // Optimistic UI update
    const updated = outputLeads.map((lead) => {
      if ((lead["Profile Link"] || "").toLowerCase().trim() === profileLink.toLowerCase().trim()) {
        return { ...lead, "Generated Personalized Outreach Text": newText };
      }
      return lead;
    });
    setOutputLeads(updated);
    setSelectedEmailLead(prev => prev ? { ...prev, "Generated Personalized Outreach Text": newText } : null);

    try {
      const res = await fetch("/api/leads/output", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileLink,
          updates: { "Generated Personalized Outreach Text": newText }
        })
      });

      if (!res.ok) {
        throw new Error("Failed to save email text on server");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Email edit failed");
      }

      showToast("Outreach template edited successfully");
    } catch (err: any) {
      console.error(err);
      setOutputLeads(previousLeads);
      setSelectedEmailLead(previousSelected);
      showToast("Error saving email edit to server", "error");
    }
  };

  const handleLeadDelete = async (profileLink: string) => {
    const previousLeads = [...outputLeads];
    const candidateName = outputLeads.find((l) => (l["Profile Link"] || "").toLowerCase().trim() === profileLink.toLowerCase().trim())?.["Candidate Name"] || "Candidate";

    // Optimistic UI update
    const updated = outputLeads.filter((lead) => (lead["Profile Link"] || "").toLowerCase().trim() !== profileLink.toLowerCase().trim());
    setOutputLeads(updated);

    try {
      const res = await fetch("/api/leads/output", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileLink })
      });

      if (!res.ok) {
        throw new Error("Failed to delete lead from server");
      }

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Lead deletion failed");
      }

      showToast(`Deleted qualified lead record: ${candidateName}`);
    } catch (err: any) {
      console.error(err);
      setOutputLeads(previousLeads);
      showToast("Error deleting lead from server", "error");
    }
  };

  // 7. Add or edit candidate in the scraped input database
  const handleCandidateSave = (candidate: InputLead) => {
    let updated: InputLead[];
    if (dialogCandidate) {
      // Editing existing (match on LinkedIn URL)
      updated = inputLeads.map((lead) =>
        lead["LinkedIn URL"] === dialogCandidate["LinkedIn URL"] ? candidate : lead
      );
      showToast(`Updated details for ${candidate.Name}`);
    } else {
      // Add new
      // Check for duplicate URLs
      if (inputLeads.some((l) => l["LinkedIn URL"] === candidate["LinkedIn URL"])) {
        showToast("A candidate with this LinkedIn URL already exists!", "error");
        return;
      }
      updated = [...inputLeads, candidate];
      showToast(`Added new lead: ${candidate.Name}`);
    }
    saveInputLeads(updated);
    setIsCandidateDialogOpen(false);
  };

  // 8. Delete candidate from scraped input database
  const handleDeleteCandidate = (url: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name} from the target source list?`)) {
      const updated = inputLeads.filter((l) => l["LinkedIn URL"] !== url);
      saveInputLeads(updated);
    }
  };

  // 8.5. Scrape / Sync operations for inputs
  const [isBulkScraping, setIsBulkScraping] = useState(false);
  const [syncingRowUrl, setSyncingRowUrl] = useState<string | null>(null);

  const handleScrapeIncompleteLeads = async () => {
    const incomplete = inputLeads.filter(
      (l) => !l.Name || !l.Headline || l.Name === "Scraped Candidate" || l.Headline === "LinkedIn Candidate"
    );
    if (incomplete.length === 0) {
      showToast("All current candidates are already fully scraped!");
      return;
    }

    setIsBulkScraping(true);
    showToast(`Starting bulk scrape for ${incomplete.length} candidate(s)...`);
    try {
      const urls = incomplete.map((l) => l["LinkedIn URL"]);
      const response = await fetch("/api/leads/scrape-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (!response.ok) {
        throw new Error("Bulk scraping execution failed");
      }

      const data = await response.json();
      if (data.success) {
        setInputLeads(data.leads);
        showToast(`Successfully scraped details for ${data.scrapedCount} candidate(s)!`);
      }
    } catch (err: any) {
      showToast(`Scrape failed: ${err.message}`, "error");
    } finally {
      setIsBulkScraping(false);
    }
  };

  const handleSyncRow = async (lead: InputLead) => {
    const url = lead["LinkedIn URL"];
    if (!url) return;
    setSyncingRowUrl(url);
    showToast(`Syncing details for ${lead.Name || "Candidate"}...`);

    try {
      const response = await fetch("/api/leads/scrape-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      });

      if (!response.ok) {
        throw new Error("Single row scrape sync failed");
      }

      const data = await response.json();
      if (data.success) {
        setInputLeads(data.leads);
        showToast(`Profile details synchronized!`);
      }
    } catch (err: any) {
      showToast(`Sync failed: ${err.message}`, "error");
    } finally {
      setSyncingRowUrl(null);
    }
  };

  const copyScriptToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(pipelinePyCode);
      setHasCopiedCode(true);
      setTimeout(() => setHasCopiedCode(false), 2000);
      showToast("Script code copied to clipboard!");
    } catch (err) {
      showToast("Failed to copy code", "error");
    }
  };

  // Quick stats
  const totalLeads = outputLeads.length;
  const qualifiedLeads = outputLeads.filter((l) => (parseInt(String(l["Calculated Fit Score"]), 10) || 0) >= threshold).length;
  const pendingOutreach = outputLeads.filter((l) => l.Status === "Pending").length;
  const completedOutreach = outputLeads.filter((l) => l.Status === "Sent").length;

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#0A0A0A] text-[#0F172A] dark:text-[#F0F0F0] flex flex-col font-sans selection:bg-[#3B82F6]/20 antialiased">
      {/* Toast Notice */}
      {toast && (
        <div id="toast-container" className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div className={`px-4 py-3 rounded-sm shadow-2xl flex items-center gap-2 text-xs font-bold border font-mono tracking-wide ${
            toast.type === "success"
              ? "bg-white dark:bg-[#141414] text-emerald-600 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-500/50"
              : "bg-white dark:bg-[#141414] text-rose-600 dark:text-rose-400 border-rose-500/30 dark:border-rose-500/50"
          }`}>
            <span className="w-2 h-2 rounded-full bg-current block animate-pulse"></span>
            {toast.message.toUpperCase()}
          </div>
        </div>
      )}

      {/* Primary Top Bar */}
      <header className="sticky top-0 z-40 bg-[#F8FAFC]/95 dark:bg-[#0A0A0A]/95 border-b border-slate-200 dark:border-[#262626] backdrop-blur-md">
        <div className="w-full max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-[10px] tracking-[0.3em] text-[#3B82F6] font-bold uppercase mb-1">Automated Lead Pipeline Engine</span>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none italic text-slate-900 dark:text-white flex items-center gap-3">
              QUAL_01
              <span className="bg-slate-100 dark:bg-[#141414] text-[#3B82F6] px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold border border-slate-200 dark:border-[#262626] not-italic tracking-wider">
                VER_2.0.25 // OSP_ROUTING
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 mt-1.5 font-mono">
              IN_DATA: input_leads.csv // OUT_LOGS: output_leads.csv // DECISION_ENGINE: AI_HEURISTICS
            </p>
          </div>

          {/* Quick Engine indicators */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-1.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer flex items-center justify-center"
              title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {theme === "dark" ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} className="text-blue-500" />}
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 block"></span>
              SYSTEM ACTIVE
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm text-[10px] font-mono uppercase tracking-wider ${groqConfigured ? 'text-[#3B82F6]' : 'text-amber-600 dark:text-amber-500'}`}>
              <Sparkles size={11} className={groqConfigured ? 'text-[#3B82F6]' : 'text-amber-600 dark:text-amber-500'} />
              GROQ: {groqConfigured ? 'CONNECTED' : 'NOT CONFIGURED'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
        
        {/* Statistics Panels (Bento) */}
        <section id="stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-[#141414] p-5 border border-slate-200 dark:border-[#262626] rounded-sm flex items-center justify-between shadow-none">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#3B82F6]">01. Scraped Sources</span>
              <h3 className="text-3xl font-black italic text-slate-900 dark:text-white">{inputLeads.length}</h3>
              <p className="text-[10px] text-slate-500 font-mono">LinkedIn candidates</p>
            </div>
            <div className="w-10 h-10 rounded-sm bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] flex items-center justify-center text-slate-500 dark:text-slate-400 font-bold font-mono text-[10px]">
              CSV
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] p-5 border border-slate-200 dark:border-[#262626] rounded-sm flex items-center justify-between shadow-none">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#3B82F6]">02. Qualified Leads</span>
              <h3 className="text-3xl font-black italic text-green-600 dark:text-green-400">
                {isLoadingOutputs ? "--" : qualifiedLeads}
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Score &gt;= {threshold}</p>
            </div>
            <div className="w-10 h-10 rounded-sm bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] flex items-center justify-center text-green-600 dark:text-green-400 font-bold font-mono text-[10px]">
              {totalLeads > 0 ? `${Math.round((qualifiedLeads / totalLeads) * 100)}%` : "0%"}
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] p-5 border border-slate-200 dark:border-[#262626] rounded-sm flex items-center justify-between shadow-none">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#3B82F6]">03. Outreach Sent</span>
              <h3 className="text-3xl font-black italic text-[#3B82F6]">
                {isLoadingOutputs ? "--" : completedOutreach}
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Exported for Outreach</p>
            </div>
            <div className="w-10 h-10 rounded-sm bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] flex items-center justify-center text-[#3B82F6] font-bold font-mono text-xs">
              ✓
            </div>
          </div>

          <div className="bg-white dark:bg-[#141414] p-5 border border-slate-200 dark:border-[#262626] rounded-sm flex items-center justify-between shadow-none">
            <div className="space-y-1">
              <span className="text-[9px] uppercase font-bold tracking-widest text-[#3B82F6]">04. Pending Review</span>
              <h3 className="text-3xl font-black italic text-amber-600 dark:text-amber-400">
                {isLoadingOutputs ? "--" : pendingOutreach}
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">Awaiting review</p>
            </div>
            <div className="w-10 h-10 rounded-sm bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold font-mono text-xs">
              ⏳
            </div>
          </div>
        </section>

        {/* Dynamic Navigation Tabs */}
        <section id="navigation-section" className="border-b border-slate-200 dark:border-[#262626] flex items-center justify-between">
          <div className="flex space-x-2 -mb-px">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-4 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "dashboard"
                  ? "border-[#3B82F6] text-slate-900 dark:text-white font-black italic"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
              id="tab-dashboard"
            >
              <Sliders size={13} className="text-[#3B82F6]" />
              Pipeline Config
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`pb-4 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "logs"
                  ? "border-[#3B82F6] text-slate-900 dark:text-white font-black italic"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
              id="tab-logs"
            >
              <FileText size={13} className="text-[#3B82F6]" />
              Excel Outreach Logs
              {outputLeads.length > 0 && (
                <span className="bg-[#3B82F6] text-black font-mono font-bold px-1.5 py-0.5 rounded-sm text-[9px]">
                  {outputLeads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("database")}
              className={`pb-4 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "database"
                  ? "border-[#3B82F6] text-slate-900 dark:text-white font-black italic"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
              id="tab-database"
            >
              <UserPlus size={13} className="text-[#3B82F6]" />
              Input Profiles (CSV)
            </button>
            <button
              onClick={() => setActiveTab("script")}
              className={`pb-4 px-5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
                activeTab === "script"
                  ? "border-[#3B82F6] text-slate-900 dark:text-white font-black italic"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
              }`}
              id="tab-script"
            >
              <Code size={13} className="text-[#3B82F6]" />
              Reference Script
            </button>
          </div>
        </section>

        {/* Tab Components */}
        {activeTab === "dashboard" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Config Panel */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Configuration Panel Card */}
              <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm p-6 space-y-5">
                <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-[#262626] pb-3">
                  <Settings size={15} className="text-[#3B82F6]" />
                  <h2 className="text-[10px] font-bold uppercase text-[#3B82F6] tracking-widest">Engine Customization</h2>
                </div>

                {/* 1. ICP Statement */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300 flex items-center gap-1">
                      Ideal Candidate Profile (ICP)
                    </label>
                    <button
                      onClick={() => {
                        setIcp(DEFAULT_ICP);
                        setIcpDirty(false);
                      }}
                      className="text-[10px] text-[#3B82F6] hover:underline font-mono uppercase font-bold"
                    >
                      Reset Default
                    </button>
                  </div>
                  <textarea
                    value={icp}
                    onChange={(e) => {
                      setIcp(e.target.value);
                      setIcpDirty(true);
                    }}
                    className="w-full h-32 p-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] rounded-sm focus:border-[#3B82F6] outline-none leading-relaxed text-slate-900 dark:text-white resize-none transition-all font-mono text-[11px]"
                    id="icp-textarea"
                  />
                </div>

                {/* 2. Scoring Mode Toggle */}
                <div className="space-y-2 text-xs">
                  <label className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300 block">Algorithmic Scoring Engine Mode</label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] rounded-sm">
                    <button
                      onClick={() => setMode("heuristic")}
                      className={`py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        mode === "heuristic"
                          ? "bg-[#3B82F6] text-black"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                      }`}
                      id="mode-heuristic-btn"
                    >
                      Offline Heuristics
                    </button>
                    <button
                      onClick={() => setMode("ai")}
                      disabled={!groqConfigured}
                      title={!groqConfigured ? "Set GROQ_API_KEY in .env to enable AI scoring" : undefined}
                      className={`py-2 rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        mode === "ai"
                          ? "bg-[#3B82F6] text-black"
                          : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:disabled:text-slate-500"
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                      id="mode-ai-btn"
                    >
                      <Sparkles size={11} className={mode === "ai" ? "text-black" : "text-[#3B82F6]"} />
                      Groq AI Matching
                    </button>
                  </div>
                  {!groqConfigured && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-500 font-mono mt-1 text-center">
                      ⚠ Set GROQ_API_KEY in .env to enable AI scoring
                    </p>
                  )}
                </div>

                {/* 3. Outreach Threshold Slider */}
                <div className="space-y-2.5 text-xs border-t border-slate-200 dark:border-[#262626] pt-4">
                  <div className="flex items-center justify-between">
                    <label className="font-bold uppercase tracking-wider text-[10px] text-slate-600 dark:text-slate-300">Outreach Email Score Threshold</label>
                    <span className="font-bold font-mono text-[#3B82F6] bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] px-2.5 py-0.5 rounded-sm text-[11px]">
                      {threshold}+ points
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="90"
                    step="5"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
                    className="w-full accent-[#3B82F6] cursor-pointer h-1.5 bg-slate-200 dark:bg-[#262626] rounded-sm appearance-none"
                    id="threshold-slider"
                  />
                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono uppercase tracking-wider">
                    <span>50 (Lenient)</span>
                    <span>75 (Recommended)</span>
                    <span>90 (Strict)</span>
                  </div>
                </div>

                {/* 4. Rule Weights (Conditional on Heuristics) */}
                {mode === "heuristic" && (
                  <div className="space-y-4 border-t border-slate-200 dark:border-[#262626] pt-4 animate-fade-in text-xs">
                    <label className="font-bold uppercase tracking-wider text-[10px] text-[#3B82F6] block">Heuristics Weights Distribution (Total 100)</label>
                    
                    <div className="space-y-3 font-mono text-[11px]">
                      {/* Education weight */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">Target Field / Degree:</span>
                          <span className="font-bold text-[#3B82F6]">{weights.education} pts</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="50"
                          step="5"
                          value={weights.education}
                          onChange={(e) => {
                            setWeights({ ...weights, education: parseInt(e.target.value, 10) });
                            setIcpDirty(true);
                          }}
                          className="w-full accent-[#3B82F6] h-1 bg-slate-200 dark:bg-[#262626] rounded-sm appearance-none cursor-pointer"
                        />
                      </div>

                      {/* Grad Year weight */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">2025/2026 Grad Window:</span>
                          <span className="font-bold text-[#3B82F6]">{weights.grad_year} pts</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="40"
                          step="5"
                          value={weights.grad_year}
                          onChange={(e) => {
                            setWeights({ ...weights, grad_year: parseInt(e.target.value, 10) });
                            setIcpDirty(true);
                          }}
                          className="w-full accent-[#3B82F6] h-1 bg-slate-200 dark:bg-[#262626] rounded-sm appearance-none cursor-pointer"
                        />
                      </div>

                      {/* AutoCAD skill weight */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">AutoCAD Design Exposure:</span>
                          <span className="font-bold text-[#3B82F6]">{weights.skills} pts</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="40"
                          step="5"
                          value={weights.skills}
                          onChange={(e) => {
                            setWeights({ ...weights, skills: parseInt(e.target.value, 10) });
                            setIcpDirty(true);
                          }}
                          className="w-full accent-[#3B82F6] h-1 bg-slate-200 dark:bg-[#262626] rounded-sm appearance-none cursor-pointer"
                        />
                      </div>

                      {/* US Location weight */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-500 dark:text-slate-400">US Geographic Location:</span>
                          <span className="font-bold text-[#3B82F6]">{weights.location_us} pts</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="30"
                          step="5"
                          value={weights.location_us}
                          onChange={(e) => {
                            setWeights({ ...weights, location_us: parseInt(e.target.value, 10) });
                            setIcpDirty(true);
                          }}
                          className="w-full accent-[#3B82F6] h-1 bg-slate-200 dark:bg-[#262626] rounded-sm appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Primary Execute Button */}
                {icpDirty && (
                  <div className="bg-amber-950/50 border border-amber-500/30 text-amber-400 text-[10px] font-mono uppercase tracking-wider px-3 py-2 rounded-sm text-center">
                    ⚠ Unsaved changes detected — re-run pipeline to apply new scoring rules.
                  </div>
                )}
                <button
                  onClick={handleRunPipeline}
                  disabled={isRunningPipeline || inputLeads.length === 0}
                  className={`w-full py-4 bg-[#3B82F6] hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-[#1C1C1C] disabled:text-slate-400 dark:disabled:text-slate-600 text-black font-black uppercase tracking-widest rounded-sm text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border-none shadow-none ${icpDirty ? 'animate-pulse' : ''}`}
                  id="run-pipeline-btn"
                >
                  {isRunningPipeline ? (
                    <>
                      <RefreshCw size={14} className="animate-spin text-black" />
                      Analyzing and Qualifying Leads...
                    </>
                  ) : (
                    <>
                      <Play size={14} className="fill-current text-black" />
                      Run Automated Pipeline
                    </>
                  )}
                </button>
              </div>

              {/* Informational Guidance Alert */}
              <div className="bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] rounded-sm p-5 flex items-start gap-3.5">
                <Info className="text-[#3B82F6] stroke-[2.5] mt-0.5 shrink-0" size={16} />
                <div className="text-xs space-y-1.5 leading-relaxed">
                  <h4 className="font-bold text-[#3B82F6] uppercase tracking-wider text-[10px]">Automated Pipeline Workflow</h4>
                  <p className="text-slate-400">
                    This pipeline maps directly to an automated <strong>n8n/Make</strong> flow or <strong>Python</strong> microservice. It reads the raw target profiles list, evaluates their fit dynamically, scores them from 1 to 100, generates structured justifications, and templates a personalized cold outreach email.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Terminal and Progress View */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase text-[#3B82F6] tracking-widest">Live Execution Logs</h3>
                <TerminalLogs
                  logs={terminalLogs}
                  isSearching={isRunningPipeline}
                  onClear={() => setTerminalLogs([])}
                />
              </div>

              {terminalLogs.length > 0 && !isRunningPipeline && (
                <div className="bg-green-50/50 dark:bg-[#141414] border border-green-300 dark:border-green-500/50 rounded-sm p-4 flex items-center justify-between text-xs animate-fade-in font-mono text-green-700 dark:text-green-400">
                  <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
                    <CheckCircle size={15} />
                    Logs updated. Spreadsheet sync complete.
                  </div>
                  <button
                    onClick={() => setActiveTab("logs")}
                    className="text-xs font-bold text-[#3B82F6] hover:underline flex items-center gap-1 uppercase tracking-wider"
                  >
                    View records
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Tab 2: Logs Table (Excel Sheet Replica) */}
        {activeTab === "logs" && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white italic uppercase tracking-tight">02 // QUALIFIED LEAD RECORDS (output_leads.csv)</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono uppercase tracking-wide">
                  Excel sheet replica representing dynamic pipeline qualification outputs
                </p>
              </div>
              <button
                onClick={fetchOutputs}
                className="p-2 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] hover:bg-slate-200 dark:hover:bg-[#202020] text-slate-600 dark:text-slate-300 rounded-sm transition-all cursor-pointer"
                title="Reload leads from disk"
                id="refresh-outputs-btn"
              >
                <RefreshCw size={13} className={isLoadingOutputs ? "animate-spin" : ""} />
              </button>
            </div>

            <LeadTable
              leads={outputLeads}
              onStatusChange={handleStatusChange}
              onViewEmail={(lead) => setSelectedEmailLead(lead)}
              isLoading={isLoadingOutputs}
              onDeleteLead={handleLeadDelete}
            />
          </div>
        )}

        {/* Tab 3: Database Editor (Input Candidates) */}
        {activeTab === "database" && (
          <div className="space-y-4 animate-fade-in">
            {/* CSV Import/Upload and Paste URLs panel */}
            <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm p-5 space-y-4">
              {/* Ingestion Method Tabs */}
              <div className="flex items-center border-b border-slate-200 dark:border-[#262626] pb-3 justify-between">
                <div className="flex space-x-4">
                  <button
                    onClick={() => setIngestMethod("csv")}
                    className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                      ingestMethod === "csv"
                        ? "border-[#3B82F6] text-slate-900 dark:text-white"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                    }`}
                  >
                    CSV Import
                  </button>
                  <button
                    onClick={() => setIngestMethod("paste")}
                    className={`pb-2 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                      ingestMethod === "paste"
                        ? "border-[#3B82F6] text-slate-900 dark:text-white"
                        : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                    }`}
                  >
                    Paste Profile URLs
                  </button>
                </div>
                
                {ingestMethod === "csv" && (
                  <button
                    onClick={downloadTemplate}
                    className="px-3 py-1.5 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download size={12} />
                    Download CSV Template
                  </button>
                )}
              </div>

              {/* Method 1: CSV Upload */}
              {ingestMethod === "csv" && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragActive(true);
                  }}
                  onDragLeave={() => setIsDragActive(false)}
                  onDrop={handleCSVDrop}
                  onClick={triggerFileSelect}
                  className={`border border-dashed rounded-sm p-6 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? "border-[#3B82F6] bg-[#3B82F6]/5"
                      : "border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black hover:border-slate-400 dark:hover:border-slate-500"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleCSVFileSelect}
                    accept=".csv"
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <UploadCloud size={28} className={isDragActive ? "text-[#3B82F6] animate-bounce" : "text-slate-500"} />
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                      {isDragActive ? (
                        <span className="text-[#3B82F6]">Drop the CSV file here...</span>
                      ) : (
                        <>
                          Drag and drop your <strong className="text-slate-900 dark:text-white">.csv</strong> file here, or <span className="text-[#3B82F6] underline">browse</span>
                        </>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                      Required column: "LinkedIn URL" (others are optional)
                    </div>
                  </div>
                </div>
              )}

              {/* Method 2: Paste Profile URLs */}
              {ingestMethod === "paste" && (
                <div className="space-y-4 font-mono text-xs">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Paste LinkedIn Profile URLs (One per line or comma-separated)
                    </label>
                    <textarea
                      value={pastedUrls}
                      onChange={(e) => setPastedUrls(e.target.value)}
                      placeholder="https://www.linkedin.com/in/alex-rivera&#10;https://www.linkedin.com/in/john-doe"
                      className="w-full h-32 p-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none text-slate-900 dark:text-white font-mono text-xs leading-relaxed resize-none"
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                      Valid prefix: linkedin.com/in/
                    </div>
                    <button
                      onClick={handlePasteScrape}
                      disabled={isScrapingUrls || !pastedUrls.trim()}
                      className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 disabled:bg-slate-200 dark:disabled:bg-[#1C1C1C] disabled:text-slate-400 dark:disabled:text-slate-600 text-black font-bold uppercase tracking-wider rounded-sm text-xs flex items-center gap-1.5 cursor-pointer border-none"
                    >
                      {isScrapingUrls ? (
                        <>
                          <RefreshCw size={13} className="animate-spin text-black" />
                          Scraping profiles...
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          Add & Scrape
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white italic uppercase tracking-tight">03 // SCRAPED LINKEDIN SOURCES (input_leads.csv)</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono uppercase tracking-wide">
                  Target source pool of lead candidates before scoring rules
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {inputLeads.some((l) => !l.Name || !l.Headline || l.Name === "Scraped Candidate" || l.Headline === "LinkedIn Candidate") && (
                  <button
                    onClick={handleScrapeIncompleteLeads}
                    disabled={isBulkScraping}
                    className="px-3 py-2 bg-[#10B981] hover:bg-emerald-600 text-black rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    id="scrape-incomplete-btn"
                    title="Run bulk scraper via Apify for missing profile details"
                  >
                    <Sparkles size={14} className={isBulkScraping ? "animate-pulse" : ""} />
                    {isBulkScraping ? "Scraping..." : "Scrape Profiles"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setDialogCandidate(null);
                    setIsCandidateDialogOpen(true);
                  }}
                  className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 text-black rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  id="add-candidate-btn"
                >
                  <Plus size={14} />
                  Add New Lead
                </button>
                <button
                  onClick={fetchInputs}
                  className="p-2 bg-slate-100 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] hover:bg-slate-200 dark:hover:bg-[#202020] text-slate-600 dark:text-slate-300 rounded-sm transition-all cursor-pointer"
                  title="Reload inputs from disk"
                  id="refresh-inputs-btn"
                >
                  <RefreshCw size={13} className={isLoadingInputs ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Input list grid */}
            <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm overflow-hidden shadow-none">
              <div className="overflow-x-auto">
                {isLoadingInputs ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3 font-mono">
                    <RefreshCw size={28} className="animate-spin text-[#3B82F6]" />
                    <p className="text-xs uppercase tracking-wider">Loading input CSV database from disk...</p>
                  </div>
                ) : inputLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-2 font-mono">
                    <AlertTriangle size={28} className="text-slate-600" />
                    <p className="text-xs uppercase tracking-wider">Scraped candidate list is empty.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[900px] text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-black border-b border-slate-200 dark:border-[#262626] text-[10px] uppercase font-bold text-[#3B82F6] tracking-widest">
                        <th className="py-3 px-5">Candidate Name</th>
                        <th className="py-3 px-5">LinkedIn Headline</th>
                        <th className="py-3 px-5">Education Background</th>
                        <th className="py-3 px-5 w-24 text-center">Grad Year</th>
                        <th className="py-3 px-5">Skills</th>
                        <th className="py-3 px-5">Location</th>
                        <th className="py-3 px-5 w-28 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-[#262626] text-slate-700 dark:text-slate-300 bg-white dark:bg-[#141414]">
                      {inputLeads.map((lead, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#1C1C1C] transition-colors">
                          <td className="py-3.5 px-5 font-semibold text-slate-900 dark:text-white">
                            <div>{lead.Name || "Incomplete Profile"}</div>
                            {lead["LinkedIn URL"] && (
                              <a
                                href={lead["LinkedIn URL"]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-[#3B82F6] hover:underline flex items-center gap-0.5 mt-0.5 font-mono"
                              >
                                View Profile
                                <ExternalLink size={8} />
                              </a>
                            )}
                          </td>
                          <td className="py-3.5 px-5 max-w-xs truncate text-slate-500 dark:text-slate-400 font-mono text-[11px]">{lead.Headline || "Unscraped"}</td>
                          <td className="py-3.5 px-5 text-slate-700 dark:text-slate-300 font-mono text-[11px]">{lead.Education || "Unscraped"}</td>
                          <td className="py-3.5 px-5 text-center font-mono font-bold text-[#3B82F6] text-xs">{lead["Graduation Year"] || "—"}</td>
                          <td className="py-3.5 px-5 max-w-xs truncate text-slate-500 dark:text-slate-400 font-mono text-[11px]">{lead.Skills || "Unscraped"}</td>
                          <td className="py-3.5 px-5 text-slate-500 dark:text-slate-400 font-mono text-[11px]">{lead.Location || "Unscraped"}</td>
                          <td className="py-3.5 px-5">
                            <div className="flex items-center justify-center space-x-1.5">
                              <button
                                onClick={() => handleSyncRow(lead)}
                                disabled={syncingRowUrl === lead["LinkedIn URL"]}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#262626] text-[#3B82F6] hover:text-[#2563EB] dark:hover:text-white rounded-sm transition-all cursor-pointer disabled:opacity-50"
                                title="Scrape details / Refresh from LinkedIn"
                                id={`sync-cand-btn-${idx}`}
                              >
                                <RefreshCw size={13} className={syncingRowUrl === lead["LinkedIn URL"] ? "animate-spin" : ""} />
                              </button>
                              <button
                                onClick={() => {
                                  setDialogCandidate(lead);
                                  setIsCandidateDialogOpen(true);
                                }}
                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#262626] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-sm transition-all cursor-pointer"
                                title="Edit candidate details"
                                id={`edit-cand-btn-${idx}`}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteCandidate(lead["LinkedIn URL"], lead.Name)}
                                className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-sm transition-all cursor-pointer"
                                title="Delete Candidate"
                                id={`delete-cand-btn-${idx}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Python Script & Integration Guide */}
        {activeTab === "script" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white italic uppercase tracking-tight">04 // AUTOMATED PYTHON PIPELINE (pipeline.py)</h2>
                <p className="text-xs text-slate-400 mt-0.5 font-mono uppercase tracking-wide">
                  Local automated pipeline script configured with current heuristics matching Excel sheets
                </p>
              </div>

              <button
                onClick={copyScriptToClipboard}
                className="px-4 py-2 bg-[#3B82F6] hover:bg-blue-600 text-black rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                id="copy-script-btn"
              >
                {hasCopiedCode ? (
                  <>
                    <Check size={14} className="text-black" />
                    Copied Code!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copy Script Source
                  </>
                )}
              </button>
            </div>

            {/* Instruction Guide & Folder Setup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              
              {/* Left col: Instructions */}
              <div className="md:col-span-1 bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] p-5 rounded-sm space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-[#262626] pb-2">
                  <BookOpen size={14} className="text-[#3B82F6]" />
                  <h3 className="font-bold uppercase tracking-wider text-[10px] text-slate-900 dark:text-slate-300">Local Setup Guide</h3>
                </div>

                <div className="space-y-3 text-slate-600 dark:text-slate-400 leading-relaxed text-[11px] font-mono">
                  <p>
                    1. Ensure you have <strong>Python 3.x</strong> installed on your desktop.
                  </p>
                  <p>
                    2. Maintain the following directory folder layout:
                  </p>
                  <div className="bg-slate-50 dark:bg-black p-2.5 rounded-sm border border-slate-200 dark:border-[#262626] text-slate-700 dark:text-slate-300 space-y-0.5">
                    <div>├── input_leads.csv</div>
                    <div>├── pipeline.py</div>
                    <div>└── output_leads.csv (auto-generated)</div>
                  </div>
                  <p>
                    3. Run the pipeline script from your local command terminal:
                  </p>
                  <div className="bg-slate-900 text-slate-100 p-2.5 rounded-sm border border-slate-800 dark:border-[#262626] overflow-x-auto">
                    python3 pipeline.py
                  </div>
                  <p className="text-[10px] text-slate-500 italic">
                    The script reads raw candidate details from <code className="bg-slate-100 dark:bg-black px-1 py-0.5 rounded text-[#2563EB] dark:text-[#3B82F6]">input_leads.csv</code>, scores them heuristically offline, drafts OSP outreach emails, and logs them directly to <code className="bg-slate-100 dark:bg-black px-1 py-0.5 rounded text-[#2563EB] dark:text-[#3B82F6]">output_leads.csv</code>.
                  </p>
                </div>
              </div>

              {/* Right col: Code viewport */}
              <div className="md:col-span-2 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] rounded-sm overflow-hidden flex flex-col max-h-[500px]">
                <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-[#141414] border-b border-slate-200 dark:border-[#262626] text-slate-600 dark:text-slate-400 font-mono text-[10px]">
                  <span>pipeline.py</span>
                  <span className="text-[#3B82F6] font-semibold">PYTHON 3.x</span>
                </div>
                <div className="bg-amber-50/50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-[#262626] px-4 py-2 text-[10px] text-amber-700 dark:text-amber-500 font-mono italic">
                  ℹ This is a standalone offline version of the scoring logic for local/CLI use. The live dashboard runs its own copy of this logic in server.ts, not this file.
                </div>
                <pre className="flex-1 overflow-y-auto p-4 text-[10px] text-slate-800 dark:text-slate-300 font-mono leading-relaxed select-all">
                  {pipelinePyCode || "Loading script source..."}
                </pre>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Footer System Credits */}
      <footer className="mt-auto border-t border-slate-200 dark:border-[#262626] bg-slate-100 dark:bg-black py-6">
        <div className="w-full max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-600 dark:text-slate-500 font-mono uppercase tracking-wider gap-4">
          <div>
            QUAL_01 // Lead Qualification Engine // Persistent full-stack CSV state management
          </div>
          <div className="flex items-center gap-1 text-[#3B82F6]">
            No external API keys required to execute local rule pipelines.
          </div>
        </div>
      </footer>

      {/* Prepared Email Modal View */}
      {selectedEmailLead && (
        <OutreachEmailModal
          candidateName={selectedEmailLead["Candidate Name"]}
          emailText={selectedEmailLead["Generated Personalized Outreach Text"]}
          onClose={() => setSelectedEmailLead(null)}
          onSave={handleEmailSave}
          onMarkSent={() => handleStatusChange(selectedEmailLead["Profile Link"], "Sent")}
          candidateEmail={inputLeads.find((il) => (il["LinkedIn URL"] || "").toLowerCase().trim() === (selectedEmailLead["Profile Link"] || "").toLowerCase().trim())?.Email || ""}
        />
      )}

      {/* Create / Edit Candidate slide-over Dialog */}
      <CandidateDialog
        lead={dialogCandidate || undefined}
        isOpen={isCandidateDialogOpen}
        onClose={() => {
          setDialogCandidate(null);
          setIsCandidateDialogOpen(false);
        }}
        onSave={handleCandidateSave}
      />
    </div>
  );
}
