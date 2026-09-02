import { ApiError } from "@google/genai";

// Gemini's "high demand" 503s are transient (Google's own error message says
// so) but count against the free tier's daily request cap either way —
// worth a couple of short retries rather than burning a whole attempt on a
// blip the user then has to notice and retry by hand.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 2000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof ApiError && error.status === 503;
      if (!retryable || attempt >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }
}
