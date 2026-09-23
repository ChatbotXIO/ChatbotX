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
    .replace(/\+?\d[\d-]{5,}\d/gu, " contact phone ")
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

/**
 * Detects non-Latin letters after normalization. This relies on
 * `\p{Script=Latin}` so every Latin-script language is accepted; normalize
 * first so Vietnamese diacritics do not appear as a separate script.
 */
const NON_LATIN_LETTER = /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u
export function containsNonLatinScript(text: string): boolean {
  return NON_LATIN_LETTER.test(normalizeSearchText(text))
}

// CJK ideographs (Han) carry no whitespace between words, so the
// space/punctuation-delimited tokenizer in `rank.ts` would otherwise fold
// an entire Chinese phrase into a single multi-character "word" -- one
// token instead of several -- silently breaking any token-count-based
// signal (matching against the English catalog, `isVocabularyMismatch`).
// A single Han character is already a meaningful unit (most carry their own
// dictionary meaning), so treating each one as its own token is a workable
// language-agnostic approximation without pulling in a real segmenter
// (jieba, etc.) for a tool-search ranker.
const HAN_CHARACTER = /\p{Script=Han}/gu

/**
 * Tokenizes free text into word-level units, splitting CJK ideographs one
 * character at a time so they don't collapse into a single opaque token.
 * Used by `rank.ts` for both catalog and query tokenization so the two
 * sides tokenize identically.
 */
export function tokenize(text: string): string[] {
  const normalized = normalizeSearchText(text)
  const hanCharacters = normalized.match(HAN_CHARACTER) ?? []
  const otherTokens =
    normalized.replace(HAN_CHARACTER, " ").match(/[\p{L}\p{N}]+/gu) ?? []
  return [...hanCharacters, ...otherTokens]
}
