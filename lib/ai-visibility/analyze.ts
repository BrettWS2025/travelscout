import { BRAND_TERMS } from "./brand";

export type MentionAnalysis = {
  mentioned: boolean;
  matchedTerms: string[];
  excerpt: string;
};

/** Detect brand terms and return a short excerpt around the first match. */
export function analyzeAssistantReply(text: string): MentionAnalysis {
  const lower = text.toLowerCase();
  const matchedTerms: string[] = [];

  for (const term of BRAND_TERMS) {
    const t = term.toLowerCase();
    if (lower.includes(t) && !matchedTerms.includes(term)) {
      matchedTerms.push(term);
    }
  }

  const mentioned = matchedTerms.length > 0;
  let excerpt = "";

  if (mentioned) {
    const sorted = [...BRAND_TERMS].sort((a, b) => b.length - a.length);
    let matchStart = -1;
    let matchLen = 0;
    for (const term of sorted) {
      const idx = lower.indexOf(term.toLowerCase());
      if (idx !== -1) {
        matchStart = idx;
        matchLen = term.length;
        break;
      }
    }
    if (matchStart !== -1) {
      const pad = 100;
      const start = Math.max(0, matchStart - pad);
      const end = Math.min(text.length, matchStart + matchLen + pad);
      excerpt =
        (start > 0 ? "…" : "") +
        text.slice(start, end).trim() +
        (end < text.length ? "…" : "");
    }
  }

  return { mentioned, matchedTerms, excerpt };
}
