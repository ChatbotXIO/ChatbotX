import { removeHtmlTags } from "@chatbotx.io/utils/feed-template"
import {
  POST_FEED_POST_TEXT_MAX,
  POST_FEED_SUMMARY_MAX,
  POST_FEED_TITLE_MAX,
} from "./limits"

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  rdquo: "”",
  rsquo: "’",
}
const LINE_BREAK_TAG = /^(?:<br\s*\/?>|<\/(?:p|div|li|h[1-6])\s*>)$/i
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi
const HEX_RADIX = 16
const MAX_CODE_POINT = 0x10_ff_ff

const decodeEntity = (match: string, body: string): string => {
  if (body.startsWith("#")) {
    const isHex = body[1] === "x" || body[1] === "X"
    const code = Number.parseInt(
      body.slice(isHex ? 2 : 1),
      isHex ? HEX_RADIX : 10,
    )
    return Number.isInteger(code) && code > 0 && code <= MAX_CODE_POINT
      ? String.fromCodePoint(code)
      : " "
  }
  return NAMED_ENTITIES[body.toLowerCase()] ?? match
}

/** Cuts to `max` characters (not UTF-16 units), ending with an ellipsis when it cut. */
export const truncateText = (value: string, max: number): string => {
  const points = Array.from(value)
  if (points.length <= max) {
    return value
  }
  return `${points
    .slice(0, Math.max(0, max - 1))
    .join("")
    .trimEnd()}…`
}

const stripControlCharacters = (value: string): string =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    const isControl = (code < 32 && code !== 9 && code !== 10) || code === 127
    return isControl ? " " : character
  }).join("")

/**
 * Plain text of an item field that may hold HTML: scripts and styles dropped,
 * tags removed, block ends turned into line breaks, entities decoded, control
 * characters and runs of blanks collapsed. Never returns markup.
 */
export const toPlainText = (value: string): string => {
  const withoutTags = removeHtmlTags(value, { breakTag: LINE_BREAK_TAG })
  return stripControlCharacters(
    removeHtmlTags(withoutTags.replace(ENTITY, decodeEntity)),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** A single-line, bounded title. */
export const cleanTitle = (value: string | null): string | null => {
  const text = value ? toPlainText(value).replace(/\s+/g, " ") : ""
  return text ? truncateText(text, POST_FEED_TITLE_MAX) : null
}

export const cleanSummary = (value: string | null): string | null => {
  const text = value ? toPlainText(value) : ""
  return text ? truncateText(text, POST_FEED_SUMMARY_MAX) : null
}

export type FeedTextItem = {
  link: string | null
  summary: string | null
  title: string | null
}

/**
 * Fills the template's `{title}`, `{link}` and `{summary}`. Item text is only
 * ever substituted as plain text; a variable the item lacks becomes empty and
 * the blank lines it leaves are removed. The result is bounded.
 */
export const renderFeedText = (
  template: string,
  item: FeedTextItem,
): string => {
  const filled = template
    .replace(/\{title\}/g, () => item.title ?? "")
    .replace(/\{link\}/g, () => item.link ?? "")
    .replace(/\{summary\}/g, () => item.summary ?? "")
  const tidy = filled
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return truncateText(tidy, POST_FEED_POST_TEXT_MAX)
}

/** http(s) only, bounded; anything else is not a link. */
export const safeLink = (value: string | null): string | null => {
  if (!value) {
    return null
  }
  const text = value.trim()
  if (text.length > 2048) {
    return null
  }
  try {
    const url = new URL(text)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null
  } catch {
    return null
  }
}
