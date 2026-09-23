/**
 * Text-normalization primitives shared by the tool-search ranker
 * (`rank.ts`) and its synonym table (`synonyms.ts`). Kept dependency-free
 * and side-effect-free so they're trivial to unit test in isolation.
 */

/**
 * Vietnamese-accent-insensitive, case-insensitive normalization. A query
 * typed without diacritics ("Tim khach") must match a tool description
 * written with them, and vice versa.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("đ", "d")
}

/**
 * Replaces literal values a user query names as a search *target* (an
 * email, a phone number, a bare numeric id) with a weak concept hint
 * instead of deleting them outright -- the literal itself never appears in
 * a tool's name or description, but the *kind* of value it is remains a
 * real signal (an email or phone number almost always means "contact").
 * Order matters: emails before phone numbers before bare digits, since a
 * phone number is itself a run of digits.
 */
export function stripLiterals(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/gu, " contact email ")
    .replace(/\+?\d[\d\s-]{5,}\d/gu, " contact phone ")
    .replace(/\b\d+\b/gu, " id ")
}

// English + Vietnamese filler words that carry no resource/action signal.
// Kept deliberately short: an over-aggressive stopword list can eat a real
// synonym key before `synonyms.ts` gets a chance to match it, so anything
// consumed here must be unambiguously filler in both languages.
export const STOPWORDS = new Set([
  // English
  "a",
  "an",
  "the",
  "this",
  "that",
  "to",
  "for",
  "of",
  "on",
  "in",
  "at",
  "by",
  "with",
  "and",
  "or",
  "is",
  "are",
  "be",
  "use",
  "using",
  "please",
  "my",
  "me",
  // Vietnamese (diacritics stripped -- normalization runs before stopword
  // filtering, so entries here are already accent-free)
  "cho",
  "cua",
  "va",
  "la",
  "co",
  "toi",
  "minh",
  "nhe",
  "di",
  "nay",
  "giup",
  "gium",
  "dum",
  "ho",
  "voi",
  "duoc",
])

/**
 * Crude suffix stemmer: enough to fold `flows`/`flow`, `tags`/`tag`,
 * `contacts`/`contact` onto the same token without pulling in a full
 * stemming library for a handful of English plurals. Left untouched for
 * anything short enough that stripping `s` would change the word's
 * meaning.
 */
export function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token
}

export function tokenize(text: string): string[] {
  return [...new Set(normalizeSearchText(text).match(/[\p{L}\p{N}]+/gu) ?? [])]
}

/**
 * Detects a query written in a script the catalog (English tool names,
 * summaries, descriptions) and the hand-written Vietnamese synonym table
 * cannot serve -- Arabic, CJK, Cyrillic, Thai, Korean, etc. Runs on
 * `normalizeSearchText`'s NFD-stripped output so precomposed Vietnamese
 * letters (`ệ`, `ạ`, `ở`, ... in Latin Extended Additional, U+1E00-U+1EFF)
 * are decomposed to plain Latin base letters + combining marks *before* this
 * check, and combining marks/diacritics are already removed by the time this
 * runs. Checking `\p{Script=Latin}` (rather than a hardcoded code-point
 * range) is what keeps this correct for every Latin-script language, not
 * just Vietnamese -- a hardcoded range like `\u0000-ɏ` would
 * misclassify Vietnamese's precomposed letters as non-Latin. Punctuation,
 * digits, symbols (currency, emoji, etc.), and whitespace are excluded from
 * the check since they carry no script information.
 */
const NON_LATIN_LETTER = /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u
export function containsNonLatinScript(text: string): boolean {
  return NON_LATIN_LETTER.test(normalizeSearchText(text))
}
