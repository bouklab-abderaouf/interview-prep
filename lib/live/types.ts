export type InterviewMode = "demo" | "full";

export type InterviewLanguage = "fr" | "en";

export interface TokenRequestBody {
  mode: InterviewMode;
  stageId?: string;
}

export interface TokenResponseBody {
  token: string;
  model: string;
  expiresAt: string;
}

export interface TokenErrorBody {
  error: string;
}
