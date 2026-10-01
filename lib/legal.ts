// Legal facts the UI states in several places (privacy page, legal notice,
// upload page, demo, interview room). One source, so they can't drift apart.
// Production readiness phase 5. This is not legal advice — have the texts
// reviewed before opening sign-ups.

/**
 * The consent wording's version. Stored with each consent
 * (profiles.ai_processing_consent_version); change it whenever the consent
 * text or the processing it describes changes.
 */
export const CONSENT_VERSION = "2026-10-01";

/**
 * Which Gemini tier the API key is on. Free tier: Google may use submitted
 * content to improve its products; paid tier: it may not. Every notice that
 * mentions it follows this — set NEXT_PUBLIC_GEMINI_TIER=paid when billing
 * is enabled (docs/CAPACITY.md).
 */
export const GEMINI_TIER: "free" | "paid" = process.env.NEXT_PUBLIC_GEMINI_TIER === "paid" ? "paid" : "free";

const TODO = "[to be completed]";

/** The publisher (mentions légales). Filled from env so no personal details live in the repo. */
export const PUBLISHER = {
  name: process.env.NEXT_PUBLIC_LEGAL_PUBLISHER_NAME || TODO,
  status: process.env.NEXT_PUBLIC_LEGAL_PUBLISHER_STATUS || TODO,
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || TODO,
  email: process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || TODO,
  host: process.env.NEXT_PUBLIC_LEGAL_HOST || TODO,
};

export const LEGAL_DETAILS_COMPLETE = !Object.values(PUBLISHER).includes(TODO);

/** Who processes what, for the privacy page and docs/DATA.md. */
export const PROCESSORS = [
  {
    name: "Supabase",
    role: "Database, file storage and sign-in",
    location: "EU (Ireland, eu-west-1)",
    data: "Account email, CVs, job descriptions, roadmaps, transcripts, scorecards",
  },
  {
    name: "Google (Gemini API)",
    role: "CV analysis, the voice interview, scoring",
    location: "United States",
    data: "CV, job description, interview audio and transcript, during processing",
  },
  {
    name: "Cloudflare (Turnstile)",
    role: "Bot check on the public demo (and sign-in, if enabled)",
    location: "Global network",
    data: "Browser and device signals during the check",
  },
  {
    name: "Vercel",
    role: "Hosting",
    location: "United States, with EU edge locations",
    data: "Request logs (IP address, pages requested)",
  },
  {
    name: "Sentry",
    role: "Error reports (only when enabled)",
    location: "EU (Frankfurt)",
    data: "Scrubbed error reports: no email, transcript, CV or request content",
  },
] as const;
