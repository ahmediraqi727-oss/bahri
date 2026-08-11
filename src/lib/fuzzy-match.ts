/**
 * fuzzy-match.ts
 * Client-side fuzzy text matching for the Ahmed Bahri auto-reply engine.
 * Uses Jaro-Winkler similarity + token overlap for Arabic/English text.
 */

export interface AutoReplyRule {
  id: string;
  trigger_keywords: string[];
  response_text: string;
  match_threshold: number;
  is_active: boolean;
  priority: number;
}

export interface MatchResult {
  rule: AutoReplyRule;
  score: number;
  matchedKeyword: string;
}

// ── Jaro similarity ───────────────────────────────────────────────────────────
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;

  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

// ── Jaro-Winkler (boosts prefix matches) ─────────────────────────────────────
export function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const j = jaro(s1, s2);
  let l = 0;
  const maxL = Math.min(4, Math.min(s1.length, s2.length));
  while (l < maxL && s1[l] === s2[l]) l++;
  return j + l * p * (1 - j);
}

// ── Arabic-aware tokenizer ────────────────────────────────────────────────────
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[،؟!.،؛:،\-_]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

// ── Similarity between two phrases (token-level best match) ──────────────────
export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return jaroWinkler(a.toLowerCase(), b.toLowerCase());

  let totalScore = 0;
  for (const tokA of ta) {
    let best = 0;
    for (const tokB of tb) {
      best = Math.max(best, jaroWinkler(tokA, tokB));
    }
    totalScore += best;
  }

  const avgScore = totalScore / ta.length;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const substringBonus = aLower.includes(bLower) || bLower.includes(aLower) ? 0.15 : 0;

  return Math.min(1, avgScore + substringBonus);
}

// ── Main matcher: find best matching rule for an input message ────────────────
export function findBestMatch(
  inputText: string,
  rules: AutoReplyRule[],
  globalThreshold?: number
): MatchResult | null {
  const activeRules = rules
    .filter((r) => r.is_active && r.trigger_keywords.length > 0)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  let best: MatchResult | null = null;

  for (const rule of activeRules) {
    const threshold = globalThreshold ?? rule.match_threshold ?? 0.9;
    for (const keyword of rule.trigger_keywords) {
      const score = similarity(inputText, keyword);
      if (score >= threshold) {
        if (!best || score > best.score) {
          best = { rule, score, matchedKeyword: keyword };
        }
      }
    }
  }

  return best;
}

// ── Quick keyword check (exact substring, faster than fuzzy) ─────────────────
export function hasExactKeyword(inputText: string, keywords: string[]): string | null {
  const lower = inputText.toLowerCase();
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) return kw;
  }
  return null;
}

// ── Combined: try exact first, fall back to fuzzy ─────────────────────────────
export function smartMatch(
  inputText: string,
  rules: AutoReplyRule[],
  globalThreshold?: number
): MatchResult | null {
  const sortedRules = [...rules]
    .filter((r) => r.is_active)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  for (const rule of sortedRules) {
    const exactKw = hasExactKeyword(inputText, rule.trigger_keywords);
    if (exactKw) {
      return { rule, score: 1.0, matchedKeyword: exactKw };
    }
  }

  return findBestMatch(inputText, rules, globalThreshold);
}
