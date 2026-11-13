import { extractContactInfo } from "@chatbotx.io/business/extract-contact"
import type {
  AutomatedResponseType,
  FileType,
  KeywordCondition,
} from "@chatbotx.io/database/partials"
import { compileKeywordRegex } from "@chatbotx.io/database/partials/keyword-condition-schema"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import { hasLink } from "@chatbotx.io/utils/has-link"
import { levenshteinDistance } from "@chatbotx.io/utils/levenshtein"
import { normalizeForMatch } from "@chatbotx.io/utils/normalize-for-match"

export type KeywordMatchMode = "contains" | "exact"

// Mirrors the `Record<AutomatedResponseType, ...>` cascade convention used
// for `automatedResponseFolderTypeByType` — a future third type fails to
// compile here instead of silently falling back to "contains".
export const keywordMatchModeByAutomatedResponseType: Record<
  AutomatedResponseType,
  KeywordMatchMode
> = {
  inbound: "contains",
  outbound: "exact",
}

export const keywordMatchesText = (
  keywords: readonly string[],
  lowerCaseText: string,
  mode: KeywordMatchMode = "contains",
): boolean => {
  const trimmedText = lowerCaseText.trim()
  return keywords
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0)
    .some((keyword) =>
      mode === "exact"
        ? trimmedText === keyword
        : lowerCaseText.includes(keyword),
    )
}

export type KeywordMatchInput = {
  text: string | null
  attachmentFileTypes: readonly FileType[]
}

type KeywordMatchRule = Pick<
  AutomatedResponseModel,
  "keywords" | "conditions" | "type"
>

// Similarity compares whole messages, so cap the O(n*m) edit distance.
const MAX_SIMILARITY_TEXT_LENGTH = 500
// Up to one edit per five characters (80% similar) still counts as similar.
const SIMILARITY_EDITS_DIVISOR = 5
const WORD_SEPARATOR_RE = /[^\p{L}\p{N}]+/u
// Variation selector and skin-tone modifiers: 👍🏽 and 👍️ are still 👍.
const THUMBS_UP_NOISE_RE = /\s|\u{FE0F}|[\u{1F3FB}-\u{1F3FF}]/gu
const THUMBS_UP_ONLY_RE = /^(?:\u{1F44D})+$/u

const normalizeMessageText = (value: string): string =>
  normalizeForMatch(value).replace(/\s+/g, " ").trim()

const splitWords = (value: string): string[] =>
  value.split(WORD_SEPARATOR_RE).filter((word) => word.length > 0)

const containsWholeWord = (text: string, keyword: string): boolean => {
  const keywordWords = splitWords(keyword)
  // An emoji/punctuation-only keyword has no words to align on.
  if (keywordWords.length === 0) {
    return text.includes(keyword)
  }
  const textWords = splitWords(text)
  for (
    let start = 0;
    start <= textWords.length - keywordWords.length;
    start++
  ) {
    if (
      keywordWords.every((word, offset) => textWords[start + offset] === word)
    ) {
      return true
    }
  }
  return false
}

const isSimilarTo = (text: string, keyword: string): boolean => {
  if (text === keyword) {
    return true
  }
  if (
    text.length === 0 ||
    keyword.length === 0 ||
    text.length > MAX_SIMILARITY_TEXT_LENGTH ||
    keyword.length > MAX_SIMILARITY_TEXT_LENGTH
  ) {
    return false
  }
  const longestLength = Math.max(text.length, keyword.length)
  // Integer maths: `1 - 0.8` is 0.19999…, which would floor 10 × it to 1.
  const maxDistance = Math.floor(longestLength / SIMILARITY_EDITS_DIVISOR)
  // The edit distance is at least the length gap, so a long message never
  // pays for the full distance against a short keyword.
  if (Math.abs(text.length - keyword.length) > maxDistance) {
    return false
  }
  return levenshteinDistance(text, keyword) <= maxDistance
}

const isThumbsUp = (text: string): boolean =>
  THUMBS_UP_ONLY_RE.test(text.replace(THUMBS_UP_NOISE_RE, ""))

// Every inbound message is checked against every regex rule, so compiled
// patterns are reused instead of recompiled per message. Bounded so a
// workspace churning through patterns cannot grow it without limit.
const MAX_COMPILED_REGEX_CACHE_SIZE = 500
const compiledRegexCache = new Map<
  string,
  ReturnType<typeof compileKeywordRegex>
>()

const getCompiledRegex = (pattern: string) => {
  if (compiledRegexCache.has(pattern)) {
    return compiledRegexCache.get(pattern) ?? null
  }
  if (compiledRegexCache.size >= MAX_COMPILED_REGEX_CACHE_SIZE) {
    compiledRegexCache.clear()
  }
  const compiled = compileKeywordRegex(pattern)
  compiledRegexCache.set(pattern, compiled)
  return compiled
}

const matchesRegex = (text: string, pattern: string): boolean =>
  getCompiledRegex(pattern)?.matcher(text).find() ?? false

const IMAGE_FILE_TYPES: readonly FileType[] = ["image", "gif"]
const VIDEO_FILE_TYPES: readonly FileType[] = ["video"]
const AUDIO_FILE_TYPES: readonly FileType[] = ["audio"]

/** Attachment types a keyword condition can match (image/video/audio). */
export const isKeywordMediaFileType = (fileType: FileType): boolean =>
  IMAGE_FILE_TYPES.includes(fileType) ||
  VIDEO_FILE_TYPES.includes(fileType) ||
  AUDIO_FILE_TYPES.includes(fileType)

const hasAttachment = (
  input: KeywordMatchInput,
  fileTypes: readonly FileType[],
): boolean =>
  input.attachmentFileTypes.some((fileType) => fileTypes.includes(fileType))

const matchesKeywordValue = (
  operator: KeywordCondition["operator"],
  text: string,
  keyword: string,
): boolean => {
  switch (operator) {
    case "is":
      return text === keyword
    case "similarTo":
      return isSimilarTo(text, keyword)
    case "containsWholeWord":
      return containsWholeWord(text, keyword)
    case "beginsWith":
      return text.startsWith(keyword)
    case "endsWith":
      return text.endsWith(keyword)
    default:
      return text.includes(keyword)
  }
}

export const keywordConditionMatches = (
  condition: KeywordCondition,
  input: KeywordMatchInput,
): boolean => {
  const rawText = input.text ?? ""
  switch (condition.operator) {
    case "containsPhone":
      return Boolean(
        extractContactInfo(rawText, null, { skipEmail: true }).phoneNumber,
      )
    case "containsEmail":
      return Boolean(
        extractContactInfo(rawText, null, { skipPhone: true }).email,
      )
    case "containsLink":
      return hasLink(rawText)
    case "containsImage":
      return hasAttachment(input, IMAGE_FILE_TYPES)
    case "containsVideo":
      return hasAttachment(input, VIDEO_FILE_TYPES)
    case "containsAudio":
      return hasAttachment(input, AUDIO_FILE_TYPES)
    case "isThumbsUp":
      return isThumbsUp(rawText)
    case "matchesRegex":
      return condition.values.some((pattern) => matchesRegex(rawText, pattern))
    default:
      break
  }

  const text = normalizeMessageText(rawText)
  const keywords = condition.values
    .map(normalizeMessageText)
    .filter((keyword) => keyword.length > 0)
  if (condition.operator === "notContains") {
    return !keywords.some((keyword) => text.includes(keyword))
  }
  if (text.length === 0) {
    return false
  }
  return keywords.some((keyword) =>
    matchesKeywordValue(condition.operator, text, keyword),
  )
}

// A voice note / audio file with no text. Intentionally opt-in: only a rule
// with an explicit `containsAudio` condition may answer it. Text-negating
// operators (`notContains`, an empty-matching `matchesRegex`) also match an
// empty text, so without this a rule like "doesn't contain stop" would start
// answering audio the moment audio reaches Keywords. Image/video-only messages
// keep matching those operators as before. Only keyword media decides it — a
// plain `file` next to the voice note does not make it reachable by text
// rules — and a whitespace-only caption counts as no text.
const isAudioOnlyMessage = (input: KeywordMatchInput): boolean => {
  if (input.text?.trim()) {
    return false
  }
  const mediaFileTypes = input.attachmentFileTypes.filter(
    isKeywordMediaFileType,
  )
  return (
    mediaFileTypes.length > 0 &&
    mediaFileTypes.every((fileType) => AUDIO_FILE_TYPES.includes(fileType))
  )
}

/**
 * Contact (inbound) rules with `conditions` match when every condition does;
 * rules without them keep the legacy `keywords` + `type` behaviour (Page
 * rules always take that path).
 */
export const ruleMatchesMessage = (
  rule: KeywordMatchRule,
  input: KeywordMatchInput,
): boolean => {
  if (rule.conditions && rule.conditions.length > 0) {
    if (
      isAudioOnlyMessage(input) &&
      !rule.conditions.some(
        (condition) => condition.operator === "containsAudio",
      )
    ) {
      return false
    }
    return rule.conditions.every((condition) =>
      keywordConditionMatches(condition, input),
    )
  }
  if (!input.text) {
    return false
  }
  return keywordMatchesText(
    rule.keywords,
    input.text.toLowerCase(),
    keywordMatchModeByAutomatedResponseType[rule.type as AutomatedResponseType],
  )
}

export const matchesAnyKeywordRule = (
  input: KeywordMatchInput,
  rules: KeywordMatchRule[],
): boolean => rules.some((rule) => ruleMatchesMessage(rule, input))
