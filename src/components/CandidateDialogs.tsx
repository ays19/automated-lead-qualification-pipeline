import React, { useState, useEffect } from "react";
import { X, UserPlus, Save, ArrowLeft, Trash2, Edit, Sparkles, Loader2 } from "lucide-react";
import { InputLead } from "../types";

interface CandidateDialogProps {
  lead?: InputLead; // If provided, we are editing. Otherwise, adding.
  isOpen: boolean;
  onClose: () => void;
  onSave: (lead: InputLead) => void;
}

export default function CandidateDialog({
  lead,
  isOpen,
  onClose,
  onSave,
}: CandidateDialogProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [education, setEducation] = useState("");
  const [gradYear, setGradYear] = useState("2025");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeSuccess, setScrapeSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (lead) {
      setUrl(lead["LinkedIn URL"] || "");
      setName(lead.Name || "");
      setHeadline(lead.Headline || "");
      setEducation(lead.Education || "");
      setGradYear(lead["Graduation Year"] || "2025");
      setSkills(lead.Skills || "");
      setLocation(lead.Location || "");
      setBio(lead["Summary/Bio"] || "");
      setEmail(lead.Email || "");
    } else {
      // Clear fields for adding new
      setUrl("");
      setName("");
      setHeadline("");
      setEducation("");
      setGradYear("2025");
      setSkills("");
      setLocation("");
      setBio("");
      setEmail("");
    }
    setErrors({});
    setScrapeSuccess(null);
  }, [lead, isOpen]);

  if (!isOpen) return null;

  const handleScrape = async () => {
    if (!url.trim()) {
      setErrors({ url: "Please enter a LinkedIn URL first to scrape." });
      return;
    }
    setErrors({});
    setIsScraping(true);
    setScrapeSuccess(null);

    try {
      const response = await fetch("/api/leads/scrape-single", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Scraping failed.");
      }

      const data = await response.json();
      if (data.lead) {
        setName(data.lead.Name || "");
        setHeadline(data.lead.Headline || "");
        setEducation(data.lead.Education || "");
        
        // Ensure graduation year is inside options (2021-2026)
        const year = data.lead["Graduation Year"] || "2025";
        if (["2021", "2022", "2023", "2024", "2025", "2026"].includes(year)) {
          setGradYear(year);
        } else {
          setGradYear("2025");
        }

        setSkills(data.lead.Skills || "");
        setLocation(data.lead.Location || "");
        setBio(data.lead["Summary/Bio"] || "");
        setEmail(data.lead.Email || "");

        if (data.source === "apify") {
          setScrapeSuccess("Live profile details scraped from Apify!");
        } else {
          setScrapeSuccess("Profile details synthesized via Groq (Preview Mode).");
        }
      }
    } catch (err: any) {
      setErrors({ url: `Scrape error: ${err.message}` });
    } finally {
      setIsScraping(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!url.trim()) newErrors.url = "LinkedIn URL is required";
    if (!name.trim()) newErrors.name = "Candidate Name is required";
    if (!education.trim()) newErrors.education = "Education details are required";
    if (!skills.trim()) newErrors.skills = "Skills list is required";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload: InputLead = {
      "LinkedIn URL": url.trim(),
      Name: name.trim(),
      Headline: headline.trim(),
      Education: education.trim(),
      "Graduation Year": gradYear.trim(),
      Skills: skills.trim(),
      Location: location.trim(),
      "Summary/Bio": bio.trim(),
      Email: email.trim(),
    };

    onSave(payload);
  };

  return (
    <div id="candidate-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm shadow-none w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-[#1C1C1C] border-b border-slate-200 dark:border-[#262626]">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-50 dark:bg-black text-[#3B82F6] border border-slate-200 dark:border-[#262626] rounded-sm">
              {lead ? <Edit size={18} /> : <UserPlus size={18} />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white italic uppercase tracking-wider">
                {lead ? "Edit Scraped Profile Data" : "Register Manual Lead"}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono uppercase tracking-wide">
                {lead ? `Modifying profile ID: ${lead.Name}` : "Add candidate using LinkedIn URL scraper"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#262626] transition-all cursor-pointer"
            id="close-candidate-dialog-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-mono">
          {/* LinkedIn URL & Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">LinkedIn Profile URL *</label>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  placeholder="https://www.linkedin.com/in/username"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className={`flex-1 p-2.5 bg-slate-50 dark:bg-black border ${
                    errors.url ? "border-rose-500 focus:border-rose-500" : "border-slate-200 dark:border-[#262626] focus:border-[#3B82F6]"
                  } rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]`}
                  disabled={!!lead || isScraping}
                  id="input-lead-url"
                />
                {!lead && (
                  <button
                    type="button"
                    onClick={handleScrape}
                    disabled={isScraping || !url}
                    className="px-3 bg-slate-50 dark:bg-black hover:bg-slate-100 dark:hover:bg-[#1C1C1C] border border-slate-200 dark:border-[#262626] text-[#3B82F6] hover:text-slate-950 dark:hover:text-white rounded-sm font-bold uppercase tracking-wider flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Autofill fields using LinkedIn scraper"
                    id="autofill-scrape-btn"
                  >
                    {isScraping ? (
                      <Loader2 size={13} className="animate-spin text-[#3B82F6]" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                  </button>
                )}
              </div>
              {errors.url && <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wider">{errors.url}</p>}
              {scrapeSuccess && <p className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider">{scrapeSuccess}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Full Name *</label>
              <input
                type="text"
                placeholder="Alex Rivera"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full p-2.5 bg-slate-50 dark:bg-black border ${
                  errors.name ? "border-rose-500 focus:border-rose-500" : "border-slate-200 dark:border-[#262626] focus:border-[#3B82F6]"
                } rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]`}
                disabled={isScraping}
                id="input-lead-name"
              />
              {errors.name && <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wider">{errors.name}</p>}
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">LinkedIn Professional Headline</label>
            <input
              type="text"
              placeholder="Civil Engineering Graduate | AutoCAD Enthusiast"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]"
              id="input-lead-headline"
            />
          </div>

          {/* Education & Graduation Year */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Education (Degree & School) *</label>
              <input
                type="text"
                placeholder="B.S. in Civil Engineering - UT Austin"
                value={education}
                onChange={(e) => setEducation(e.target.value)}
                className={`w-full p-2.5 bg-slate-50 dark:bg-black border ${
                  errors.education ? "border-rose-500 focus:border-rose-500" : "border-slate-200 dark:border-[#262626] focus:border-[#3B82F6]"
                } rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]`}
                id="input-lead-education"
              />
              {errors.education && <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wider">{errors.education}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Graduation Year</label>
              <select
                value={gradYear}
                onChange={(e) => setGradYear(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]"
                id="input-lead-grad-year"
              >
                <option value="2026">2026</option>
                <option value="2025">2025</option>
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
                <option value="2021">2021</option>
              </select>
            </div>
          </div>

          {/* Skills */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Skills (Comma-separated) *</label>
            <input
              type="text"
              placeholder="AutoCAD, Civil3D, Drafting"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              className={`w-full p-2.5 bg-slate-50 dark:bg-black border ${
                errors.skills ? "border-rose-500 focus:border-rose-500" : "border-slate-200 dark:border-[#262626] focus:border-[#3B82F6]"
              } rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]`}
              id="input-lead-skills"
            />
            {errors.skills && <p className="text-[10px] text-rose-400 font-mono uppercase tracking-wider">{errors.skills}</p>}
          </div>

          {/* Location & Email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Location</label>
              <input
                type="text"
                placeholder="Austin, TX, USA"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]"
                id="input-lead-location"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Email Address</label>
              <input
                type="email"
                placeholder="candidate@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px]"
                id="input-lead-email"
              />
            </div>
          </div>

          {/* Biography / Summary */}
          <div className="space-y-1">
            <label className="block text-slate-700 dark:text-slate-300 text-[9px] uppercase tracking-wider font-bold">Summary / About Bio</label>
            <textarea
              placeholder="Provide a bio of the candidate to mimic a LinkedIn summary..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full h-24 p-2.5 bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none transition-all text-slate-900 dark:text-white font-mono text-[11px] resize-none leading-relaxed"
              id="input-lead-bio"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-200 dark:border-[#262626] flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-[#141414] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#202020] rounded-sm font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
              id="cancel-candidate-dialog-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#3B82F6] hover:bg-blue-600 text-black rounded-sm font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
              id="save-candidate-dialog-btn"
            >
              <Save size={14} />
              {lead ? "Save Changes" : "Register Candidate"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
