import type { InterviewLanguage } from "@/lib/live/types";

// specs §7.2 — matched on word boundaries, case-insensitive. Multi-word
// tokens (du coup, you know) match as literal phrases.
export const FILLER_WORDS: Record<InterviewLanguage, string[]> = {
  fr: ["euh", "ben", "du coup", "en fait", "voilà", "genre", "tu vois", "disons", "comment dire"],
  en: ["um", "uh", "like", "you know", "basically", "actually", "sort of", "kind of", "I mean", "right"],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// \b is ASCII-only ([A-Za-z0-9_]) and misbehaves on accented words like
// "voilà" — lookaround against \p{L}/\p{N} handles Unicode letters correctly.
function boundaryRegex(phrase: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}_])`, "giu");
}

export function countFillers(text: string, language: InterviewLanguage): number {
  return FILLER_WORDS[language].reduce((count, filler) => {
    const matches = text.match(boundaryRegex(filler));
    return count + (matches?.length ?? 0);
  }, 0);
}
