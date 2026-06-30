export interface InputLead {
  "LinkedIn URL": string;
  Name: string;
  Headline: string;
  Education: string;
  "Graduation Year": string;
  Skills: string;
  Location: string;
  "Summary/Bio": string;
  Email?: string;
  [key: string]: string; // Fallback for raw parsing index
}

export interface OutputLead {
  "Candidate Name": string;
  "Profile Link": string;
  "Calculated Fit Score": string | number;
  Justification: string;
  "Generated Personalized Outreach Text": string;
  Status: "Pending" | "Sent" | "Rejected" | string;
  [key: string]: any;
}

export interface RuleWeights {
  education: number;
  grad_year: number;
  skills: number;
  location_us: number;
}

export type PipelineMode = "heuristic" | "ai";
