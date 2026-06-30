import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import Groq from "groq-sdk";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Groq client setup
const groqApiKey = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

// Sender info from environment
const SENDER_NAME = process.env.SENDER_NAME || "";
const SENDER_TITLE = process.env.SENDER_TITLE || "";
const SENDER_COMPANY = process.env.SENDER_COMPANY || "";

async function callGroq(prompt: string, schemaDescription: string): Promise<any> {
  if (!groq) {
    throw new Error("GROQ_API_KEY is not defined.");
  }

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a helpful assistant. You must output only a valid JSON object matching the following structure. Do not output any conversational filler, markdown formatting blocks (like \`\`\`json), or text outside of the JSON object.
Required structure:
${schemaDescription}`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.1
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from Groq API.");
  }

  return JSON.parse(content);
}

// Persistent data file paths
const INPUT_CSV_PATH  = path.join(process.cwd(), "input_leads.csv");
const OUTPUT_CSV_PATH = path.join(process.cwd(), "output_leads.csv");
const PIPELINE_PY_PATH = path.join(process.cwd(), "pipeline.py");

// FIX 1: correct actor ID — harvestapi, not bebity
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID || "harvestapi/linkedin-profile-scraper";

// FIX 2: pipeline run guard — prevents double-runs from double-clicks
let pipelineRunning = false;

// ---------------------------------------------------------------------------
// Apify field mapper
// harvestapi/linkedin-profile-scraper returns slightly different field names
// than bebity. This mapper handles both plus common variations defensively.
// ---------------------------------------------------------------------------
function mapApifyProfileToLead(profile: any, url: string): Record<string, string> {
  let name = profile.fullName || profile.name || "";
  if (!name && (profile.firstName || profile.lastName)) {
    name = `${profile.firstName || ""} ${profile.lastName || ""}`.trim();
  }
  if (!name) {
    const match = url.match(/linkedin\.com\/in\/([^/]+)/i);
    name = match ? match[1].replace(/[-_]/g, " ") : "Scraped Candidate";
  }

  const headline = profile.headline || profile.title || profile.position || "LinkedIn Candidate";

  let location = "";
  if (typeof profile.location === "string") {
    location = profile.location;
  } else if (profile.location && typeof profile.location === "object") {
    location = profile.location.name || profile.location.country || profile.location.city || "";
  }
  if (!location) {
    location = profile.locationName || profile.country || profile.city || "United States";
  }

  let skillsStr = "";
  if (Array.isArray(profile.skills)) {
    skillsStr = profile.skills
      .map((s: any) => {
        if (typeof s === "string") return s;
        if (s && typeof s === "object") return s.name || s.title || "";
        return "";
      })
      .filter(Boolean)
      .join(", ");
  } else if (typeof profile.skills === "string") {
    skillsStr = profile.skills;
  }

  const summary = profile.about || profile.summary || profile.description || "";

  let educationStr = "";
  let gradYear = "2025";

  if (Array.isArray(profile.education) && profile.education.length > 0) {
    const eduList = profile.education.map((edu: any) => {
      const school = edu.schoolName || edu.school || "";
      const degree = edu.degreeName || edu.degree || "";
      const field  = edu.fieldOfStudy || edu.field || "";

      let eduYear = "";
      if (edu.end || edu.endDate || edu.dateRange) {
        const dateVal = edu.end || edu.endDate || edu.dateRange;
        if (typeof dateVal === "object" && dateVal.year) {
          eduYear = String(dateVal.year);
        } else if (typeof dateVal === "string") {
          const m = dateVal.match(/\b(202\d)\b/);
          if (m) eduYear = m[1];
        } else if (typeof dateVal === "number") {
          eduYear = String(dateVal);
        }
      }
      if (eduYear && parseInt(eduYear, 10) >= 2020 && parseInt(eduYear, 10) <= 2028) {
        gradYear = eduYear;
      }

      let detail = "";
      if (degree && field) detail = `${degree} in ${field}`;
      else if (degree || field) detail = degree || field;
      return detail ? `${detail} - ${school}` : school;
    }).filter(Boolean);

    educationStr = eduList.join("; ");
  } else if (typeof profile.education === "string") {
    educationStr = profile.education;
  }

  // Fallback: search headline/bio for graduation year
  if (gradYear === "2025") {
    const textToSearch = `${headline} ${summary} ${educationStr}`.toLowerCase();
    const m = textToSearch.match(/\b(202[4-6])\b/);
    if (m) gradYear = m[1];
  }

  return {
    "LinkedIn URL":   url,
    Name:             name,
    Headline:         headline,
    Education:        educationStr || "Engineering Candidate",
    "Graduation Year": gradYear,
    Skills:           skillsStr || "AutoCAD, Civil Engineering",
    Location:         location,
    "Summary/Bio":    summary,
    Email:            profile.email || profile.Email || "",
  };
}

// ---------------------------------------------------------------------------
// Apify scraper call
// ---------------------------------------------------------------------------
async function scrapeLinkedInProfiles(urls: string[]): Promise<any[]> {
  const apiKey  = process.env.APIFY_API_KEY;
  // FIX 1: use harvestapi actor by default
  const actorId = process.env.APIFY_ACTOR_ID || "harvestapi/linkedin-profile-scraper";

  if (!apiKey) throw new Error("APIFY_API_KEY environment variable is not set.");

  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // harvestapi/linkedin-profile-scraper input schema
      body: JSON.stringify({ profileUrls: urls, urls }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Apify API error: ${response.status} - ${errText}`);
  }

  const dataset = await response.json();
  return Array.isArray(dataset) ? dataset : [];
}

// ---------------------------------------------------------------------------
// Groq fallback mock profile generator
// ---------------------------------------------------------------------------
async function generateMockProfileWithGroq(url: string): Promise<any> {
  if (!groq) {
    const username  = url.split("/in/")[1]?.split("/")[0] || "candidate";
    const cleanName = username.split("-").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return {
      fullName: cleanName,
      headline: "Civil Engineering Graduate | AutoCAD Designer",
      location: "Dallas, TX, USA",
      skills:   ["AutoCAD", "Drafting", "Civil3D", "GIS"],
      about:    "Eager engineering graduate seeking a career in utility design and telecom infrastructure.",
      education: [{
        schoolName:   "Texas A&M University",
        degreeName:   "B.S.",
        fieldOfStudy: "Civil Engineering",
        end: { year: 2025 },
      }],
    };
  }

  try {
    const prompt = `Generate a realistic LinkedIn candidate profile for URL: "${url}".
Mix matching candidates (2025/2026 grads, AutoCAD, civil/mech/structural, US-based) with
non-matching ones (software dev, old grad year, outside US) for testing diversity.
Let the username in the URL inspire the generated profile.`;

    const schemaDescription = `A JSON object with exactly the following fields:
- fullName: string (candidate's name)
- headline: string (professional summary/headline)
- location: string (geographic location)
- skills: array of strings (candidate's skills)
- about: string (summary/bio of the candidate)
- education: array of objects, where each object has:
  - schoolName: string
  - degreeName: string
  - fieldOfStudy: string
  - end: object with a 'year' integer property`;

    return await callGroq(prompt, schemaDescription);
  } catch (err) {
    console.error("Groq mock generation error:", err);
    return {
      fullName: "Alex Rivera",
      headline: "Civil Engineering Graduate | AutoCAD Enthusiast",
      location: "Austin, TX, USA",
      skills:   ["AutoCAD", "Civil3D", "GIS"],
      about:    "Engineering graduate with solid AutoCAD foundations.",
      education: [{
        schoolName: "UT Austin", degreeName: "B.S.",
        fieldOfStudy: "Civil Engineering", end: { year: 2025 },
      }],
    };
  }
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------
function parseCSV(text: string): Record<string, string>[] {
  const result: Record<string, string>[] = [];
  const lines: string[][] = [];
  let row: string[] = [];
  let currentToken = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char     = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') { currentToken += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(currentToken.trim());
      currentToken = "";
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      row.push(currentToken.trim());
      if (row.length > 0 && (row.length > 1 || row[0] !== "")) lines.push(row);
      currentToken = "";
      row = [];
    } else {
      currentToken += char;
    }
  }
  if (currentToken !== "" || row.length > 0) { row.push(currentToken.trim()); lines.push(row); }
  if (lines.length === 0) return [];

  const headers = lines[0].map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i];
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      const cleanHeader = header.replace(/^\uFEFF/, "");
      obj[cleanHeader] = values[index] !== undefined ? values[index] : "";
    });
    result.push(obj);
  }
  return result;
}

function stringifyCSV(headers: string[], data: Record<string, any>[]): string {
  const escapeField = (val: any) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers.join(","), ...data.map((r) => headers.map((h) => escapeField(r[h])).join(","))].join("\n");
}

// ---------------------------------------------------------------------------
// Heuristic scoring engine (mirrors pipeline.py exactly)
// ---------------------------------------------------------------------------
function qualifyHeuristically(row: Record<string, string>, threshold: number, weights: any) {
  let score = 0;
  const justifications: string[] = [];

  const headline   = (row["Headline"]      || "").toLowerCase();
  const education  = (row["Education"]     || "").toLowerCase();
  const gradYearStr = row["Graduation Year"] || "";
  const skills     = (row["Skills"]        || "").toLowerCase();
  const location   = (row["Location"]      || "").toLowerCase();
  const bio        = (row["Summary/Bio"]   || "").toLowerCase();
  const combined   = `${headline} ${education} ${skills} ${bio}`;

  // 1. Education (35 pts)
  let isTargetDegree = false;
  const matchingDegrees: string[] = [];
  const degreeKeywords: Record<string, string> = {
    civil:                   "Civil Engineering",
    mechanical:              "Mechanical Engineering",
    structural:              "Structural Engineering",
    "construction management": "Construction Management",
    "project management":    "Project Management",
  };
  for (const [kw, label] of Object.entries(degreeKeywords)) {
    if (combined.includes(kw)) { isTargetDegree = true; matchingDegrees.push(label); }
  }
  if (isTargetDegree) {
    score += weights.education;
    justifications.push(`Matching degree field detected: ${matchingDegrees.join(", ")}`);
  } else if (combined.includes("engineering") || combined.includes("engineer")) {
    score += 15;
    justifications.push("Non-target engineering degree detected");
  } else {
    justifications.push("Degree field does not align with core technical ICP targets");
  }

  // 2. Graduation year (25 pts)
  if (gradYearStr === "2025" || gradYearStr === "2026") {
    score += weights.grad_year;
    justifications.push(`Target graduation year matched: ${gradYearStr}`);
  } else if (gradYearStr === "2024") {
    score += 10;
    justifications.push("Graduated 2024 — recent but slightly older than prime 2025/2026 target");
  } else {
    justifications.push(`Graduation year (${gradYearStr || "Unknown"}) is outside the 2025-2026 target window`);
  }

  // 3. AutoCAD / CAD skills (25 pts)
  if (combined.includes("autocad") || combined.includes("cad")) {
    score += weights.skills;
    justifications.push("AutoCAD/CAD modeling exposure verified");
  } else {
    justifications.push("No AutoCAD or drafting software exposure detected");
  }

  // 4. US location (15 pts) — FIX 4: word-boundary regex only, no substring fallback
  const usTerms = [
    "usa", "united states", String.raw`\bus\b`,
    String.raw`\btx\b`, String.raw`\bil\b`, String.raw`\bca\b`,
    String.raw`\bga\b`, String.raw`\bma\b`, String.raw`\bny\b`,
    "texas", "california", "georgia", "florida", "illinois",
  ];
  const isUs = usTerms.some((term) => new RegExp(term, "i").test(location));

  if (isUs) {
    score += weights.location_us;
    justifications.push("Located in the United States (eligible for immediate OSP positions)");
  } else {
    justifications.push("Location is outside the US or undetermined");
  }

  // 5. CS/Software penalty
  if ((combined.includes("computer science") || combined.includes("software")) && !isTargetDegree) {
    score = Math.max(5, score - 30);
    justifications.push("Profile heavily oriented towards Software/CS rather than Infrastructure Engineering");
  }

  const finalScore = Math.min(100, Math.max(0, score));

  // Cold email generation — FIX 5: pulls bio detail for personalisation
  let outreach = `N/A - Candidate score below threshold of ${threshold}`;
  if (finalScore >= threshold) {
    const name   = row["Name"]      || "there";
    const edName = row["Education"] || "your engineering studies";
    let school = "your university", degree = edName;
    if (edName.includes(" - ")) {
      const parts = edName.split(" - ");
      degree = parts[0].trim();
      school = parts[parts.length - 1].trim();
    }
    const autocadMention = (row["Skills"] || "").toLowerCase().includes("autocad")
      ? "your hands-on AutoCAD experience"
      : "your drafting and design background";

    const bioRaw        = row["Summary/Bio"] || "";
    const firstSentence = bioRaw.split(".")[0].trim();
    const bioHook       = firstSentence.length > 20
      ? `\n\nI noticed you mentioned: "${firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1)}." That kind of initiative is exactly what our OSP teams look for.\n`
      : "";

    const hasSenderInfo = SENDER_NAME.trim() && SENDER_TITLE.trim() && SENDER_COMPANY.trim();
    const signOff = hasSenderInfo 
      ? `\n\nBest regards,\n\n${SENDER_NAME}\n${SENDER_TITLE}\n${SENDER_COMPANY}` 
      : "";

    outreach =
      `Subject: Entry-Level OSP Engineering Opportunity — ${name}\n\n` +
      `Hi ${name},\n\n` +
      `I came across your profile and was impressed by your background in ${degree} from ${school}.${bioHook}\n` +
      `We are actively hiring entry-level Civil, Mechanical, and Construction Engineering graduates ` +
      `open to building a career in Telecom / Outside Plant (OSP) Engineering — ` +
      `a fast-growing infrastructure sector with strong career progression.\n\n` +
      `Given ${autocadMention}, I believe your design foundation would translate directly to ` +
      `mapping and detailing fiber/telecom layouts in the field.\n\n` +
      `Would you be open to a brief 10-minute call next Tuesday or Wednesday to explore if this is a mutual fit?` +
      signOff;
  }

  return { score: finalScore, justification: justifications.join(" | "), outreach };
}

// ---------------------------------------------------------------------------
// Routes — Input leads
// ---------------------------------------------------------------------------
app.get("/api/leads/input", (req, res) => {
  try {
    if (!fs.existsSync(INPUT_CSV_PATH)) return res.json({ leads: [] });
    const parsed = parseCSV(fs.readFileSync(INPUT_CSV_PATH, "utf-8"));
    res.json({ leads: parsed });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/leads/input", (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads)) return res.status(400).json({ error: "Leads must be an array" });
     const headers = ["LinkedIn URL", "Name", "Headline", "Education", "Graduation Year", "Skills", "Location", "Summary/Bio", "Email"];
    fs.writeFileSync(INPUT_CSV_PATH, stringifyCSV(headers, leads), "utf-8");
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Scrape single profile (for manual dialog autofill)
app.post("/api/leads/scrape-single", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") return res.status(400).json({ error: "LinkedIn URL is required" });

    const apiKey = process.env.APIFY_API_KEY;
    if (apiKey) {
      const dataset = await scrapeLinkedInProfiles([url]);
      if (dataset.length > 0) {
        return res.json({ success: true, lead: mapApifyProfileToLead(dataset[0], url), source: "apify" });
      }
      return res.status(404).json({ error: "No profile returned from Apify." });
    }

    const mock = await generateMockProfileWithGroq(url);
    return res.json({
      success: true,
      lead: mapApifyProfileToLead(mock, url),
      source: "groq_mock",
      warning: "No APIFY_API_KEY set. Generated mock data using Groq.",
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk scrape
app.post("/api/leads/scrape-bulk", async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: "Array of URLs required" });

    let existingLeads: Record<string, string>[] = [];
    if (fs.existsSync(INPUT_CSV_PATH)) {
      existingLeads = parseCSV(fs.readFileSync(INPUT_CSV_PATH, "utf-8"));
    }

    const apiKey = process.env.APIFY_API_KEY;
    const scrapedLeads: Record<string, string>[] = [];

    if (apiKey) {
      const dataset = await scrapeLinkedInProfiles(urls);
      urls.forEach((url, i) => {
        const match = dataset.find((item: any) => {
          const itemUrl = item.url || item.linkedinUrl || item.profileUrl || item.inputUrl || "";
          return itemUrl.toLowerCase().includes(url.toLowerCase()) || url.toLowerCase().includes(itemUrl.toLowerCase());
        }) || dataset[i];
        scrapedLeads.push(match
          ? mapApifyProfileToLead(match, url)
          : { "LinkedIn URL": url, Name: "Scraped Candidate", Headline: "LinkedIn Candidate",
              Education: "B.S. in Civil Engineering", "Graduation Year": "2025",
              Skills: "AutoCAD", Location: "USA", "Summary/Bio": "", Email: "" });
      });
    } else {
      for (const url of urls) {
        scrapedLeads.push(mapApifyProfileToLead(await generateMockProfileWithGroq(url), url));
      }
    }

    const merged = [...existingLeads];
    scrapedLeads.forEach((scraped) => {
      const idx = merged.findIndex((l) => l["LinkedIn URL"].toLowerCase().trim() === scraped["LinkedIn URL"].toLowerCase().trim());
      if (idx !== -1) merged[idx] = { ...merged[idx], ...scraped };
      else merged.push(scraped);
    });

    const headers = ["LinkedIn URL", "Name", "Headline", "Education", "Graduation Year", "Skills", "Location", "Summary/Bio", "Email"];
    fs.writeFileSync(INPUT_CSV_PATH, stringifyCSV(headers, merged), "utf-8");
    res.json({ success: true, leads: merged, scrapedCount: scrapedLeads.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Routes — Output leads
// ---------------------------------------------------------------------------
app.get("/api/leads/output", (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_CSV_PATH)) return res.json({ leads: [] });
    res.json({ leads: parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8")) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// FIX 6: Save output leads — append mode (deduplicate by Profile Link)
app.post("/api/leads/output", (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads)) return res.status(400).json({ error: "Leads must be an array" });

    const headers = ["Candidate Name", "Profile Link", "Calculated Fit Score",
                     "Justification", "Generated Personalized Outreach Text", "Status"];

    let existing: Record<string, any>[] = [];
    if (fs.existsSync(OUTPUT_CSV_PATH)) {
      existing = parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8"));
    }
    const existingLinks = new Set(existing.map((r) => (r["Profile Link"] || "").toLowerCase().trim()));
    const newLeads = leads.filter((l) => !existingLinks.has((l["Profile Link"] || "").toLowerCase().trim()));
    const all = [...existing, ...newLeads];

    fs.writeFileSync(OUTPUT_CSV_PATH, stringifyCSV(headers, all), "utf-8");
    res.json({ success: true, appended: newLeads.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update specific lead in output_leads.csv in-place
app.patch("/api/leads/output", (req, res) => {
  try {
    const { profileLink, updates } = req.body;
    if (!profileLink || typeof profileLink !== "string") {
      return res.status(400).json({ error: "profileLink is required and must be a string" });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "updates is required and must be an object" });
    }

    if (!fs.existsSync(OUTPUT_CSV_PATH)) {
      return res.status(404).json({ error: "output_leads.csv does not exist" });
    }

    const existing = parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8"));
    const targetLink = profileLink.toLowerCase().trim();

    const targetRow = existing.find((row) => (row["Profile Link"] || "").toLowerCase().trim() === targetLink);
    if (!targetRow) {
      return res.status(404).json({ error: `Lead with Profile Link '${profileLink}' not found.` });
    }

    const outreachText = targetRow["Generated Personalized Outreach Text"] || "";
    const isBelowThreshold = outreachText.startsWith("N/A");
    if (isBelowThreshold) {
      return res.status(400).json({ error: "Cannot modify a candidate below the qualification threshold." });
    }

    let updatedRow: any = null;
    const all = existing.map((row) => {
      const rowLink = (row["Profile Link"] || "").toLowerCase().trim();
      if (rowLink === targetLink) {
        const newRow = { ...row };
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            newRow[key] = String(value);
          }
        }
        updatedRow = newRow;
        return newRow;
      }
      return row;
    });

    if (!updatedRow) {
      return res.status(404).json({ error: `Lead with Profile Link '${profileLink}' not found.` });
    }

    const headers = ["Candidate Name", "Profile Link", "Calculated Fit Score",
                     "Justification", "Generated Personalized Outreach Text", "Status"];

    fs.writeFileSync(OUTPUT_CSV_PATH, stringifyCSV(headers, all), "utf-8");
    res.json({ success: true, lead: updatedRow });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete specific lead from output_leads.csv in-place
app.delete("/api/leads/output", (req, res) => {
  try {
    const { profileLink } = req.body;
    if (!profileLink || typeof profileLink !== "string") {
      return res.status(400).json({ error: "profileLink is required and must be a string in the request body" });
    }

    if (!fs.existsSync(OUTPUT_CSV_PATH)) {
      return res.status(404).json({ error: "output_leads.csv does not exist" });
    }

    const existing = parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8"));
    const targetLink = profileLink.toLowerCase().trim();

    let deletedRow: any = null;
    const remaining = existing.filter((row) => {
      const rowLink = (row["Profile Link"] || "").toLowerCase().trim();
      if (rowLink === targetLink) {
        deletedRow = row;
        return false;
      }
      return true;
    });

    if (!deletedRow) {
      return res.status(404).json({ error: `Lead with Profile Link '${profileLink}' not found.` });
    }

    const headers = ["Candidate Name", "Profile Link", "Calculated Fit Score",
                     "Justification", "Generated Personalized Outreach Text", "Status"];

    fs.writeFileSync(OUTPUT_CSV_PATH, stringifyCSV(headers, remaining), "utf-8");
    res.json({ success: true, lead: deletedRow });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------------------------------------------------------------------
// Export Excel (.xlsx) route
// ---------------------------------------------------------------------------
app.get("/api/leads/export-excel", async (req, res) => {
  try {
    let leads: Record<string, string>[] = [];
    if (fs.existsSync(OUTPUT_CSV_PATH)) {
      leads = parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8"));
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Qualified Leads", {
      views: [{ state: 'frozen', ySplit: 1 }] // Freeze row 1
    });

    const headers = [
      { header: "Candidate Name", key: "Candidate Name", width: 25 },
      { header: "Profile Link", key: "Profile Link", width: 40 },
      { header: "Calculated Fit Score", key: "Calculated Fit Score", width: 22 },
      { header: "Justification", key: "Justification", width: 60 },
      { header: "Generated Personalized Outreach Text", key: "Generated Personalized Outreach Text", width: 80 },
      { header: "Status", key: "Status", width: 15 }
    ];

    worksheet.columns = headers;

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F4E79" }
      };
      cell.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
        size: 11
      };
    });

    leads.forEach((lead) => {
      const row = worksheet.addRow({
        "Candidate Name": lead["Candidate Name"],
        "Profile Link": lead["Profile Link"],
        "Calculated Fit Score": lead["Calculated Fit Score"],
        "Justification": lead["Justification"],
        "Generated Personalized Outreach Text": lead["Generated Personalized Outreach Text"],
        "Status": lead["Status"] || "Pending",
      });

      const scoreCell = row.getCell("Calculated Fit Score");
      const score = parseInt(String(scoreCell.value), 10) || 0;
      scoreCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: score >= 75 ? "FFC6EFCE" : "FFFFC7CE" }
      };

      const statusCell = row.getCell("Status");
      statusCell.dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"Pending,Sent,Rejected"'],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "Invalid Status",
        error: "Please select a valid status from the dropdown."
      };
    });

    res.setHeader('Content-Disposition', 'attachment; filename="qualified_leads.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Pipeline code viewer
app.get("/api/pipeline/code", (req, res) => {
  try {
    if (!fs.existsSync(PIPELINE_PY_PATH)) return res.status(404).json({ error: "pipeline.py not found" });
    res.json({ code: fs.readFileSync(PIPELINE_PY_PATH, "utf-8") });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Health endpoint returning configuration status
app.get("/api/health", (req, res) => {
  res.json({
    groqConfigured: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim() !== ""),
    apifyConfigured: !!(process.env.APIFY_API_KEY && process.env.APIFY_API_KEY.trim() !== "")
  });
});

// ---------------------------------------------------------------------------
// Constants used by /api/pipeline/run
// ---------------------------------------------------------------------------
const WEIGHTS_DEFAULT = { education: 35, grad_year: 25, skills: 25, location_us: 15 };
const DEFAULT_ICP_DESC =
  "Recent 2025/2026 Civil, Mechanical, Structural, Project Management, or Construction Management " +
  "Engineering graduates in the US seeking entry-level roles, ideally with AutoCAD exposure, " +
  "who could pivot into Telecom/OSP engineering.";

// ---------------------------------------------------------------------------
// Main pipeline run endpoint
// FIX 2: guarded with pipelineRunning flag
// FIX 6: output appends instead of overwriting
// ---------------------------------------------------------------------------
app.get("/api/pipeline/run", async (req, res) => {
  // FIX 2: prevent concurrent runs
  if (pipelineRunning) {
    return res.status(429).json({ error: "Pipeline is already running. Please wait for it to finish." });
  }
  pipelineRunning = true;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const emit = (msg: string) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

  const mode = req.query.mode as string;
  const threshold = req.query.threshold ? parseInt(req.query.threshold as string, 10) : 75;
  const icp = (req.query.icp as string) || DEFAULT_ICP_DESC;
  const weights = req.query.weights ? JSON.parse(req.query.weights as string) : WEIGHTS_DEFAULT;

  try {
    emit(`[${new Date().toLocaleTimeString()}] Starting Automated Cold Lead Qualification Pipeline...`);
    emit(`[${new Date().toLocaleTimeString()}] Ingesting source CSV: input_leads.csv`);

    if (!fs.existsSync(INPUT_CSV_PATH)) {
      throw new Error("input_leads.csv does not exist. Please upload or save inputs first.");
    }

    const parsedLeads = parseCSV(fs.readFileSync(INPUT_CSV_PATH, "utf-8"));
    emit(`[${new Date().toLocaleTimeString()}] Loaded ${parsedLeads.length} target lead(s).`);

    // Identify leads that need scraping (missing Name/Headline)
    const leadsToScrape = parsedLeads.filter((lead) => {
      const url  = lead["LinkedIn URL"] || "";
      const name = lead["Name"] || "";
      const hdl  = lead["Headline"] || "";
      return url && (!name || !hdl || name === "Scraped Candidate");
    });

    if (leadsToScrape.length > 0) {
      emit(`[${new Date().toLocaleTimeString()}] ${leadsToScrape.length} lead(s) need profile scraping. Launching scraper...`);
      const urlsToScrape = leadsToScrape.map((l) => l["LinkedIn URL"]);
      const apiKey = process.env.APIFY_API_KEY;
      const scrapedLeads: Record<string, string>[] = [];

      try {
        if (apiKey) {
          // FIX 1: actor name in log message
          emit(`[${new Date().toLocaleTimeString()}] Triggering Apify actor: ${process.env.APIFY_ACTOR_ID || "harvestapi/linkedin-profile-scraper"}...`);
          const dataset = await scrapeLinkedInProfiles(urlsToScrape);

          urlsToScrape.forEach((url, idx) => {
            const match = dataset.find((item: any) => {
              const itemUrl = item.url || item.linkedinUrl || item.profileUrl || item.inputUrl || "";
              return itemUrl.toLowerCase().includes(url.toLowerCase()) || url.toLowerCase().includes(itemUrl.toLowerCase());
            }) || dataset[idx];

            scrapedLeads.push(match
              ? mapApifyProfileToLead(match, url)
              : { "LinkedIn URL": url, Name: "Scraped Candidate", Headline: "LinkedIn Candidate",
                  Education: "B.S. in Civil Engineering", "Graduation Year": "2025",
                  Skills: "AutoCAD", Location: "USA", "Summary/Bio": "", Email: "" });
          });
          emit(`[${new Date().toLocaleTimeString()}] Scraped ${scrapedLeads.length} profile(s) via Apify.`);
        } else {
          emit(`[${new Date().toLocaleTimeString()}] No APIFY_API_KEY — using Groq fallback for mock profiles...`);
          for (const url of urlsToScrape) {
            scrapedLeads.push(mapApifyProfileToLead(await generateMockProfileWithGroq(url), url));
          }
          emit(`[${new Date().toLocaleTimeString()}] Generated ${scrapedLeads.length} mock profile(s) via Groq.`);
        }
      } catch (scrapeErr: any) {
        emit(`[${new Date().toLocaleTimeString()}] [!] Scraper failed: ${scrapeErr.message}. Using defaults.`);
        parsedLeads.forEach((lead) => {
          if (!lead["Name"])            lead["Name"]            = "Scraped Candidate";
          if (!lead["Headline"])        lead["Headline"]        = "LinkedIn Candidate";
          if (!lead["Education"])       lead["Education"]       = "Engineering Graduate";
          if (!lead["Graduation Year"]) lead["Graduation Year"] = "2025";
          if (!lead["Skills"])          lead["Skills"]          = "AutoCAD";
          if (!lead["Location"])        lead["Location"]        = "USA";
        });
      }

      // Merge scraped data back
      scrapedLeads.forEach((scraped) => {
        const idx = parsedLeads.findIndex(
          (l) => l["LinkedIn URL"].toLowerCase().trim() === scraped["LinkedIn URL"].toLowerCase().trim()
        );
        if (idx !== -1) parsedLeads[idx] = { ...parsedLeads[idx], ...scraped };
      });

      const inHeaders = ["LinkedIn URL", "Name", "Headline", "Education", "Graduation Year", "Skills", "Location", "Summary/Bio", "Email"];
      fs.writeFileSync(INPUT_CSV_PATH, stringifyCSV(inHeaders, parsedLeads), "utf-8");
      emit(`[${new Date().toLocaleTimeString()}] Updated profile database saved to input_leads.csv.`);
    }

    // Score every lead
    const outputLeads: Record<string, any>[] = [];

    for (let i = 0; i < parsedLeads.length; i++) {
      const lead = parsedLeads[i];
      const name = lead["Name"] || `Lead #${i + 1}`;
      const url  = lead["LinkedIn URL"] || "";

      emit(`[${new Date().toLocaleTimeString()}] [${i + 1}/${parsedLeads.length}] Processing: ${name}...`);

      let finalScore = 0, finalJustification = "", finalOutreach = "";

      if (mode === "ai" && groq) {
        emit(`[${new Date().toLocaleTimeString()}] -> Querying Groq for AI candidate matching...`);
        try {
          let signOffText = "";
          if (SENDER_NAME.trim()) {
            signOffText = `Best,\n${SENDER_NAME.trim()}`;
            const titleCompanyParts: string[] = [];
            if (SENDER_TITLE.trim()) titleCompanyParts.push(SENDER_TITLE.trim());
            if (SENDER_COMPANY.trim()) titleCompanyParts.push(SENDER_COMPANY.trim());
            if (titleCompanyParts.length > 0) {
              signOffText += `\n${titleCompanyParts.join(", ")}`;
            }
          }

          const companyInstructions = SENDER_COMPANY.trim()
            ? `The company name is "${SENDER_COMPANY}". You can mention it in the email subject or paragraphs if relevant.`
            : `The company name is unknown. Do NOT mention any company name or use any placeholders like '[Company Name]' or '[Company]' anywhere. Make the email reference general OSP/Telecom opportunities.`;

          const prompt =
            `You are an expert recruiter qualifying candidates for Outside Plant (OSP) / Telecom roles.\n` +
            `Qualify this candidate against our ICP:\n"${icp}"\n\n` +
            `Candidate Profile:\n` +
            `- Name: ${lead["Name"] || "Unknown"}\n` +
            `- Headline: ${lead["Headline"] || "Unknown"}\n` +
            `- Education: ${lead["Education"] || "Unknown"}\n` +
            `- Graduation Year: ${lead["Graduation Year"] || "Unknown"}\n` +
            `- Skills: ${lead["Skills"] || "Unknown"}\n` +
            `- Location: ${lead["Location"] || "Unknown"}\n` +
            `- Bio: ${lead["Summary/Bio"] || "Unknown"}\n\n` +
            `Task:\n` +
            `1. Score the candidate from 1 to 100 based on their fit with the ICP.\n` +
            `2. Provide a 2-sentence justification of the score.\n` +
            `3. Generate a highly specific, tailored cold outreach email divided into Subject, Paragraph 1, and Paragraph 2.\n\n` +
            `Email Section Requirements:\n` +
            `- VARY the opening sentence structure of Paragraph 1. Do NOT default to "I came across your profile and was impressed by...". Use or adapt one of these opening styles:\n` +
            `  * Detail-first style: Lead directly with a specific detail from their profile, e.g., "Your work with AutoCAD at UT Austin caught my attention because..."\n` +
            `  * Role-first style: Lead with the opportunity itself, e.g., "We're hiring for an entry-level OSP Engineering role that I think your Mechanical Engineering background fits perfectly..."\n` +
            `  * Skill-focused style: Lead with a standout skill they have, e.g., "Seeing your solid background in AutoCAD and project scheduling, I wanted to reach out about..."\n` +
            `  * Background-pivot style: Lead with how their field translates to OSP, e.g., "As a recent graduate in Construction Management, you have exactly the structural drafting foundation we look for when training entry-level OSP Engineers..."\n` +
            `- Paragraph 1 (email_body_p1) must reference at least one concrete, specific detail from the candidate's actual profile (e.g. school name, a specific employer, a specific skill/tool, grad year, or bio detail) and briefly explain the logical bridge/reasoning for why a pivot from their background to Telecom/OSP engineering makes sense. Do NOT include any call request or signature here. Under 80 words.\n` +
            `- Paragraph 2 (email_body_p2) must contain only a specific, low-friction introductory call request (e.g. a 15-minute call next week). Do NOT include any signature or other info here.\n` +
            `- Do NOT use placeholders (like '[Your Name]', '[Company Name]', or brackets) anywhere.\n` +
            `- Company Name instructions: ${companyInstructions}`;

          const schemaDescription = `A JSON object with exactly the following fields:
- score: integer (fit score from 1 to 100)
- justification: string (a 2-sentence justification of the score)
- subject: string (email subject line)
- email_body_p1: string (personalized first paragraph of email body)
- email_body_p2: string (second paragraph containing only introductory call request)`;

          const resData = await callGroq(prompt, schemaDescription);
          finalScore       = typeof resData.score === "number" ? resData.score : 50;
          finalJustification = resData.justification || "AI-analyzed match.";

          if (finalScore >= threshold) {
            const subject = resData.subject || "Opportunities in OSP/Telecom Engineering";
            const p1 = resData.email_body_p1 || "";
            const p2 = resData.email_body_p2 || "";
            
            finalOutreach = `Subject: ${subject}\n\n${p1}\n\n${p2}`;
            if (signOffText) {
              finalOutreach += `\n\n${signOffText}`;
            }
          } else {
            finalOutreach = `N/A - Candidate score below threshold of ${threshold}`;
          }
        } catch (aiErr: any) {
          emit(`[${new Date().toLocaleTimeString()}] [!] Groq error: ${aiErr.message}. Falling back to heuristic.`);
          const fb = qualifyHeuristically(lead, threshold, weights);
          finalScore = fb.score; finalJustification = "[Fallback] " + fb.justification; finalOutreach = fb.outreach;
        }
      } else {
        if (mode === "ai" && !groq) {
          emit(`[${new Date().toLocaleTimeString()}] [!] No Groq key — using heuristic engine.`);
        } else {
          emit(`[${new Date().toLocaleTimeString()}] -> Running offline heuristic scoring...`);
        }
        const h = qualifyHeuristically(lead, threshold, weights);
        finalScore = h.score; finalJustification = h.justification; finalOutreach = h.outreach;
      }

      const status = finalScore >= threshold ? "Pending" : "Rejected";
      emit(`[${new Date().toLocaleTimeString()}]    Score: ${finalScore}/100 | Status: ${status}`);

      outputLeads.push({
        "Candidate Name":                       name,
        "Profile Link":                         url,
        "Calculated Fit Score":                 finalScore,
        Justification:                          finalJustification,
        "Generated Personalized Outreach Text": finalOutreach,
        Status:                                 status,
      });
    }

    // Upsert results to output CSV (deduplicate/update by Profile Link)
    emit(`[${new Date().toLocaleTimeString()}] Upserting results to output_leads.csv...`);
    const outHeaders = ["Candidate Name", "Profile Link", "Calculated Fit Score",
                        "Justification", "Generated Personalized Outreach Text", "Status"];

    let existing: Record<string, any>[] = [];
    if (fs.existsSync(OUTPUT_CSV_PATH)) {
      existing = parseCSV(fs.readFileSync(OUTPUT_CSV_PATH, "utf-8"));
    }

    const outputLeadsMap = new Map<string, Record<string, any>>();
    outputLeads.forEach((lead) => {
      const link = (lead["Profile Link"] || "").toLowerCase().trim();
      if (link) {
        outputLeadsMap.set(link, lead);
      }
    });

    let updatedCount = 0;
    let addedCount = 0;

    const allLeads = existing.map((existingRow) => {
      const link = (existingRow["Profile Link"] || "").toLowerCase().trim();
      const newLead = outputLeadsMap.get(link);
      if (newLead) {
        updatedCount++;
        outputLeadsMap.delete(link); // Mark as handled

        // Upsert: keep existing Status, replace other fields
        return {
          ...existingRow,
          "Candidate Name":                       newLead["Candidate Name"],
          "Calculated Fit Score":                 newLead["Calculated Fit Score"],
          Justification:                          newLead["Justification"],
          "Generated Personalized Outreach Text": newLead["Generated Personalized Outreach Text"],
          Status:                                 existingRow.Status || newLead.Status
        };
      }
      return existingRow;
    });

    // Append any remaining new leads
    const newLeadsToAppend: any[] = [];
    outputLeads.forEach((lead) => {
      const link = (lead["Profile Link"] || "").toLowerCase().trim();
      if (outputLeadsMap.has(link)) {
        addedCount++;
        newLeadsToAppend.push(lead);
      }
    });

    const finalLeads = [...allLeads, ...newLeadsToAppend];

    fs.writeFileSync(OUTPUT_CSV_PATH, stringifyCSV(outHeaders, finalLeads), "utf-8");
    emit(`[${new Date().toLocaleTimeString()}] Updated ${updatedCount} existing lead(s), added ${addedCount} new lead(s).`);
    emit(`[${new Date().toLocaleTimeString()}] Pipeline complete!`);

    res.write(`event: done\ndata: ${JSON.stringify(outputLeads)}\n\n`);
    res.end();
  } catch (err: any) {
    emit(`[${new Date().toLocaleTimeString()}] [FATAL ERROR] ${err.message}`);
    res.end();
  } finally {
    pipelineRunning = false;
  }
});

// ---------------------------------------------------------------------------
// Vite / production static serving
// ---------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

startServer();