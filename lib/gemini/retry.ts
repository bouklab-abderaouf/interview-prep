import { ApiError } from "@google/genai";

// GEMINI_TEXT_MODEL first, then GEMINI_TEXT_FALLBACK_MODEL if one is set.
export function textModels(): string[] {
  const primary = process.env.GEMINI_TEXT_MODEL;
  if (!primary) throw new Error("GEMINI_TEXT_MODEL not configured");
  const fallback = process.env.GEMINI_TEXT_FALLBACK_MODEL;
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

// Gemini's "high demand" 503s are transient (Google's own error message says
// so) but count against the free tier's per-minute and daily caps either way:
// two analyses that failed on 3 × 503 each left gemini-3.6-flash at 5/5 RPM
// and 12/20 RPD. Hammering the same model is the expensive way to wait out a
// capacity problem, and free-tier quotas are per model — so after a short
// retry, move to the next model, which is both a different capacity pool and
// a separate quota.
//
// 503: retry this model up to `attemptsPerModel` times, then move on.
// 429: this model's quota is spent; retrying it can't help, move on now.
// Anything else (400 schema rejection, auth, a bug): throw — another model
// won't fix it.
export async function withModelFallback<T>(
  models: string[],
  call: (model: string) => Promise<T>,
  { attemptsPerModel = 2, baseDelayMs = 2000, label = "gemini" } = {},
): Promise<T> {
  let lastError: unknown;
  for (const [index, model] of models.entries()) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      try {
        const result = await call(model);
        if (index > 0) console.warn(`[${label}] succeeded on fallback model ${model}`);
        return result;
      } catch (error) {
        lastError = error;
        if (!(error instanceof ApiError) || (error.status !== 503 && error.status !== 429)) throw error;
        if (error.status === 429) break;
        if (attempt < attemptsPerModel) {
          await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
        }
      }
    }
    if (index < models.length - 1) {
      const status = lastError instanceof ApiError ? lastError.status : "error";
      console.warn(`[${label}] ${model} failed with ${status}; trying ${models[index + 1]}`);
    }
  }
  throw lastError;
}
