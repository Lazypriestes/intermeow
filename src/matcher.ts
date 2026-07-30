/**
 * Keyword-overlap scorer. This is the seam where a real embedding model would
 * slot in later; for the demo, deterministic keyword overlap keeps the scripted
 * interview predictable. Multi-word keywords ("breaks down") match as phrases;
 * single words match as tokens.
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'is',
  'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'with', 'as', 'at',
  'by', 'so', 'if', 'we', 'you', 'i', 'they', 'do', 'does', 'did', 'have',
  'has', 'had', 'what', 'how', 'why', 'when', 'about', 'your', 'my', 'our',
  'me', 'them', 'can', 'could', 'would', 'should', 'not', 'get', 'got',
])

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  )
}

/**
 * Score one utterance against a keyword list.
 * Phrase keywords (containing a space) score 3 on substring match.
 * Single-word keywords score 2 on token match.
 */
export function scoreKeywords(utterance: string, keywords: string[]): number {
  const lower = utterance.toLowerCase()
  const tokens = tokenize(utterance)
  let s = 0
  for (const kw of keywords) {
    const k = kw.toLowerCase()
    if (k.includes(' ')) {
      if (lower.includes(k)) s += 3
    } else if (tokens.has(k)) {
      s += 2
    }
  }
  return s
}
