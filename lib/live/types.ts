export type InterviewMode = "demo" | "full";

export type InterviewLanguage = "fr" | "en";

export interface TokenRequestBody {
  mode: InterviewMode;
  stageId?: string;
  /** Required when mode is 'demo' — specs §5.3. */
  turnstileToken?: string;
  /** Defaults to 'fr' server-side when omitted. */
  language?: InterviewLanguage;
}

export interface TokenResponseBody {
  token: string;
  model: string;
  expiresAt: string;
}

export interface TokenErrorBody {
  error: string;
}
