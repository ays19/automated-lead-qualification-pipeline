import React, { useState } from "react";
import { Mail, Copy, Check, X, FileText, ChevronRight, Edit2 } from "lucide-react";

interface OutreachEmailModalProps {
  candidateName: string;
  emailText: string;
  onClose: () => void;
  onSave?: (newText: string) => void;
  onMarkSent?: () => void;
  candidateEmail?: string;
}

export default function OutreachEmailModal({
  candidateName,
  emailText,
  onClose,
  onSave,
  onMarkSent,
  candidateEmail = "",
}: OutreachEmailModalProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(emailText);
  const [email, setEmail] = useState(candidateEmail);
  const [emailError, setEmailError] = useState("");

  // Parse subject and body
  const lines = editedText.split("\n");
  let subject = "";
  let bodyLines: string[] = [];

  let foundSubject = false;
  lines.forEach((line) => {
    if (line.toLowerCase().startsWith("subject:")) {
      subject = line.replace(/subject:/i, "").trim();
      foundSubject = true;
    } else {
      if (foundSubject || line.trim() !== "") {
        bodyLines.push(line);
      }
    }
  });

  const bodyText = bodyLines.join("\n").trim();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(editedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (onMarkSent) onMarkSent();
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editedText);
    }
    setIsEditing(false);
  };

  const handleSendMail = () => {
    setEmailError("");
    if (!email.trim()) {
      setEmailError("Email address is required to send.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    const encodedSubject = encodeURIComponent(subject || `Outreach to ${candidateName}`);
    const encodedBody = encodeURIComponent(bodyText);
    const mailtoLink = `mailto:${email.trim()}?subject=${encodedSubject}&body=${encodedBody}`;

    window.location.href = mailtoLink;

    if (onMarkSent) {
      onMarkSent();
    }
  };

  return (
    <div 
      id="email-modal" 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-sm shadow-none w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-100 dark:bg-[#1C1C1C] border-b border-slate-200 dark:border-[#262626]">
          <div className="flex items-center space-x-3 font-mono">
            <div className="p-2 bg-slate-50 dark:bg-black text-[#3B82F6] border border-slate-200 dark:border-[#262626] rounded-sm">
              <Mail size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white italic uppercase tracking-wider">Prepared Outreach Copy</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Custom tailored for candidate: {candidateName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#262626] transition-all cursor-pointer"
            id="close-email-modal-btn"
          >
            <X size={18} />
          </button>
        </div>

        {/* Email Client Layout */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono">
          {/* Candidate email input */}
          <div className="space-y-1.5 bg-slate-50 dark:bg-black/40 p-3.5 border border-slate-200 dark:border-[#262626] rounded-sm text-xs">
            <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Recipient Email Address
            </label>
            <input
              type="email"
              placeholder="candidate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm text-slate-900 dark:text-white font-mono outline-none"
              id="modal-email-input"
            />
          </div>

          {isEditing ? (
            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-[#3B82F6] uppercase tracking-wider">
                Outreach Text Editor (Markdown / Raw Format)
              </label>
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full h-80 p-4 text-xs font-mono text-slate-900 dark:text-white bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#262626] focus:border-[#3B82F6] rounded-sm outline-none resize-none leading-relaxed"
                id="email-editor-textarea"
              />
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-[#262626] rounded-sm overflow-hidden shadow-none">
              {/* Fake Email Envelope details */}
              <div className="bg-slate-50 dark:bg-black p-4 border-b border-slate-200 dark:border-[#262626] space-y-2 text-xs">
                <div className="flex items-center text-slate-500">
                  <span className="w-16 font-bold text-slate-500 uppercase text-[10px]">To:</span>
                  <span className="text-black bg-[#3B82F6] px-2 py-0.5 rounded-sm font-bold">{candidateName}</span>
                </div>
                <div className="flex items-center text-slate-500">
                  <span className="w-16 font-bold text-slate-500 uppercase text-[10px]">From:</span>
                  <span className="text-slate-600 dark:text-slate-300">outreach@telecom-ops-talent.com</span>
                </div>
                <div className="flex items-start text-slate-500 pt-1 border-t border-slate-200 dark:border-[#262626]">
                  <span className="w-16 font-bold text-slate-500 uppercase text-[10px] mt-0.5">Subject:</span>
                  <span className="text-slate-900 dark:text-white font-bold">{subject || "No Subject Line Generated"}</span>
                </div>
              </div>

              {/* Email Content Body */}
              <pre className="p-6 bg-slate-50 dark:bg-black text-xs text-slate-800 dark:text-slate-300 leading-relaxed font-sans whitespace-pre-wrap select-text max-h-80 overflow-y-auto">
                {bodyText || "No email content generated."}
              </pre>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        <div className="px-6 py-4 bg-slate-100 dark:bg-[#141414] border-t border-slate-200 dark:border-[#262626] space-y-3 font-mono text-xs">
          {emailError && (
            <p className="text-[10px] text-rose-500 dark:text-rose-400 uppercase tracking-wider font-mono">
              ⚠️ {emailError}
            </p>
          )}
          {!isEditing && (
            <p className="text-[10px] text-slate-500 uppercase tracking-wide leading-relaxed">
              ℹ️ Opens your default mail app — marks as "Sent" once you click, regardless of whether you send it.
            </p>
          )}
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    className="px-3 py-1.5 bg-[#3B82F6] hover:bg-blue-600 text-black rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    id="save-email-edit-btn"
                  >
                    Save Changes
                  </button>
                  <button
                    onClick={() => {
                      setEditedText(emailText);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                    id="cancel-email-edit-btn"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-black hover:bg-slate-100 dark:hover:bg-[#1C1C1C] text-slate-700 dark:text-slate-300 rounded-sm text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
                  id="edit-email-btn"
                >
                  <Edit2 size={13} />
                  Edit Template
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {!isEditing && (
                <button
                  onClick={handleSendMail}
                  className="px-4 py-1.5 bg-[#10B981] hover:bg-emerald-600 text-black rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer border-none"
                  id="send-email-btn"
                >
                  <Mail size={13} />
                  Send via Mail App
                </button>
              )}
              {!isEditing && (
                <button
                  onClick={handleCopy}
                  className={`px-4 py-1.5 rounded-sm text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                    copied
                      ? "bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                      : "bg-[#3B82F6] hover:bg-blue-600 text-black"
                  }`}
                  id="copy-email-btn"
                >
                  {copied ? (
                    <>
                      <Check size={13} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copy Email
                    </>
                  )}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-1.5 border border-slate-200 dark:border-[#262626] bg-slate-50 dark:bg-[#141414] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1C1C1C] rounded-sm text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
                id="close-email-btn"
              >
                Done
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
