import {
  measureText,
  POST_PUBLISHING_RULES,
} from "@chatbotx.io/utils/post-publishing"
import type { SocialProvider } from "@chatbotx.io/utils/social-account"

const TAB = 9
const LINE_FEED = 10
const FIRST_PRINTABLE = 32
const DELETE_CHAR = 127

/** The smallest documented text limit of one network, over the content types the registry enables. */
export type ProviderTextLimit = { limit: number; provider: SocialProvider }

/**
 * The text limit of each network (the smallest documented one over the content
 * types the registry enables; types that carry no text are skipped). A network
 * with no documented limit is left out.
 */
export const postTextLimitsFor = (
  providers: readonly SocialProvider[],
): ProviderTextLimit[] =>
  providers.flatMap((provider) => {
    const limits = Object.values(
      POST_PUBLISHING_RULES[provider].contentTypes,
    ).flatMap((rule) =>
      rule.enabled && rule.text.maxLength !== null && rule.text.maxLength > 0
        ? [rule.text.maxLength]
        : [],
    )
    return limits.length > 0 ? [{ limit: Math.min(...limits), provider }] : []
  })

/** The shortest limit over the networks, or `null` when none documents one. */
export const shortestLimit = (
  limits: readonly ProviderTextLimit[],
): number | null =>
  limits.length > 0 ? Math.min(...limits.map((item) => item.limit)) : null

/**
 * Model output as it may be stored: control characters (except tab and line
 * feed) removed, so an answer can never smuggle terminal or protocol bytes
 * into a post.
 */
export const stripControlCharacters = (text: string): string =>
  Array.from(text)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return (
        code === TAB ||
        code === LINE_FEED ||
        (code >= FIRST_PRINTABLE && code !== DELETE_CHAR)
      )
    })
    .join("")

const fitsEvery = (
  text: string,
  limits: readonly ProviderTextLimit[],
): boolean =>
  limits.every((item) => measureText(item.provider, text) <= item.limit)

/**
 * Cuts the text until it fits every network in the unit that network counts
 * (`measureText`: UTF-16 units, or Threads' emoji-as-UTF-8-bytes), without
 * splitting a character. A longer prefix never measures shorter, so the longest
 * fitting prefix is found by bisection.
 */
export const clampToLimits = (
  text: string,
  limits: readonly ProviderTextLimit[],
): { text: string; truncated: boolean } => {
  if (fitsEvery(text, limits)) {
    return { text, truncated: false }
  }
  const graphemes = Array.from(
    new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  )
  let low = 0
  let high = graphemes.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (fitsEvery(graphemes.slice(0, middle).join(""), limits)) {
      low = middle
    } else {
      high = middle - 1
    }
  }
  return { text: graphemes.slice(0, low).join("").trimEnd(), truncated: true }
}
