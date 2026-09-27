/**
 * Text-normalization primitives shared by the tool-search ranker. Kept
 * dependency-free and side-effect-free so they're trivial to unit test in
 * isolation.
 */

/**
 * Vietnamese-accent-insensitive, case-insensitive normalization. A query
 * typed without diacritics ("Tim khach") must match a tool description
 * written with them, and vice versa.
 */
export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replaceAll("đ", "d")
}

type SearchTermAlias = {
  canonical: string
  pattern: RegExp
}

// The catalog is English, while MCP callers routinely speak their customers'
// language. These are high-confidence action/resource terms shared by the
// supported multilingual evaluation locales; they supplement, never replace,
// the original query so exact tool names and unfamiliar terms still work.
const SEARCH_TERM_ALIASES: readonly SearchTermAlias[] = [
  {
    canonical: "add",
    pattern: /\b(gan|anade|agrega(r|do|da)?|ajoute(r)?)\b/u,
  },
  { canonical: "tag", pattern: /\betiqueta\b|\betiquette\b|标签/u },
  {
    canonical: "contact",
    pattern: /\bkhach(\s+hang)?\b|\bcontacto?s?\b|联系人/u,
  },
  {
    canonical: "send",
    pattern: /\bgui\b|\benvia(r|do|da)?\b|\benvoie(r|z)?\b|发送/u,
  },
  {
    canonical: "message",
    pattern: /\btin nhan\b|\bmensaje\b|\bmessage\b|消息/u,
  },
  {
    canonical: "reply",
    pattern: /\btra loi\b|\bresponde(r)?\b|\brepond(re|s)?\b|回复/u,
  },
  {
    canonical: "conversation",
    pattern: /\bhoi thoai\b|\bconversacion\b|\bconversation\b|对话/u,
  },
  {
    canonical: "create",
    pattern: /\btao\b|\bcrea(r|do|da)?\b|\bcree(r|z)?\b|创建/u,
  },
  { canonical: "flow", pattern: /\bflow\b|\bflujo\b|流程/u },
  {
    canonical: "validate",
    pattern: /\bkiem tra\b|\bvalida\b|\bvalide\b|验证/u,
  },
  {
    canonical: "publish",
    pattern: /\bpublish\b|\bpublica(r|lo|la)?\b|\bpublie(r|z)?\b|发布/u,
  },
  {
    canonical: "broadcast",
    pattern: /\bbroadcast\b|\bdifusion\b|\bdiffusion\b|群发/u,
  },
  { canonical: "audience", pattern: /\baudiencia\b|\baudience\b|受众/u },
  {
    canonical: "schedule",
    pattern:
      /\blen lich\b|\bprograma(r|lo|la)?\b|\bplanifie(r|z)?\b|\bprogramme(r)?\b|安排/u,
  },
  {
    canonical: "appointment",
    pattern: /\blich hen\b|\bcita\b|\brendez[-\s]vous\b|预约/u,
  },
  {
    canonical: "book",
    pattern: /\bdat\b|\breserva(r|do|da)?\b|\breserve(r|z)?\b|预约/u,
  },
  {
    canonical: "subscribe",
    pattern: /\bdang ky\b|\bsuscrib(e|ir|elo|ela)?\b|\binscri(re|s|t)?\b|订阅/u,
  },
  {
    canonical: "sequence",
    pattern: /\bchuoi\b|\bsecuencia\b|\bsequence\b|序列/u,
  },
  { canonical: "new", pattern: /\bmoi\b|\bnuevos?\b|\bnouveaux?\b|新增/u },
]

const VIETNAMESE_TAG_WORD = /\bnhãn\b/iu
const VIETNAMESE_TAG_ACTION = /\b(gan|them|go|xoa)\s+(nhan|tag)\b/u
const VIETNAMESE_ADD_TAG_ACTION = /\b(gan|them)\s+(nhan|tag)\b/u

const ENGLISH_REPLY_WORD = /\breply\b/u
const ENGLISH_CONVERSATION_WORD = /\bconversation\b/u
/**
 * Adds canonical English action/resource terms for supported non-English
 * intents. This stays deterministic and local: it never sends user content
 * to a translation service or guesses a tool name.
 */
export function expandSearchQuery(text: string): string {
  const normalized = normalizeSearchText(text)
  const aliases = SEARCH_TERM_ALIASES.filter(({ pattern }) =>
    pattern.test(normalized),
  ).map(({ canonical }) => canonical)
  const hasVietnameseTagIntent =
    VIETNAMESE_TAG_WORD.test(text) || VIETNAMESE_TAG_ACTION.test(normalized)
  if (hasVietnameseTagIntent) {
    aliases.push("tag")
    if (VIETNAMESE_ADD_TAG_ACTION.test(normalized)) {
      aliases.push("add")
    }
  }
  const hasConversationReply =
    (aliases.includes("reply") && aliases.includes("conversation")) ||
    (ENGLISH_REPLY_WORD.test(normalized) &&
      ENGLISH_CONVERSATION_WORD.test(normalized))
  if (hasConversationReply && !aliases.includes("message")) {
    aliases.push("message")
  }
  return aliases.length === 0 ? text : `${text} ${aliases.join(" ")}`
}

/**
 * Replaces literal values a user query names as a search *target* (an
 * email, a phone number, a bare numeric id) with a weak concept hint
 * instead of deleting them outright -- the literal itself never appears in
 * a tool's name or description, but the *kind* of value it is remains a
 * real signal (an email or phone number almost always means "contact").
 * Order matters: emails before dates before phone numbers before bare digits,
 * since a phone number is itself a run of digits.
 */
export function stripLiterals(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/gu, " contact email ")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/gu, " date ")
    .replace(/\+?\d[\d-]{5,}\d/gu, " contact phone ")
    .replace(/\b\d+\b/gu, " id ")
}

// English filler words that carry no resource/action signal. Kept deliberately
// short so an over-aggressive list cannot remove meaningful query terms.
export const STOPWORDS = new Set([
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
const COMBINING_MARK = /\p{M}/u

export function containsNonLatinScript(text: string): boolean {
  return NON_LATIN_LETTER.test(normalizeSearchText(text))
}

/**
 * Detects queries that are not English: any non-Latin script, or Latin text
 * with diacritics such as Vietnamese, French, or Spanish.
 */
export function looksNonEnglish(text: string): boolean {
  const normalized = text.toLowerCase().normalize("NFD")
  return (
    containsNonLatinScript(text) ||
    COMBINING_MARK.test(normalized) ||
    normalized.includes("đ")
  )
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
