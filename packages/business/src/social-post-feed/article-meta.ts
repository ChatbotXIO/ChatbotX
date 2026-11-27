import { safeLink, toPlainText } from "./text"

/** The page is read up to this many characters; the head is nearly always far smaller. */
export const ARTICLE_HTML_MAX_CHARS = 1_048_576
/** A `<meta>` tag longer than this is skipped. */
const MAX_META_TAG_CHARS = 4096
const MAX_META_TAGS = 400

/** Preference order: the first key that names a usable address wins. */
const IMAGE_KEYS = [
  "og:image:secure_url",
  "og:image",
  "og:image:url",
  "twitter:image",
  "twitter:image:src",
] as const
const KEY_ATTRIBUTES = ["property", "name"] as const
const BLANK = /\s/
const NAME_CHAR = /[a-z0-9_]/i

const asciiLower = (text: string): string =>
  text.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

/** `indexOf` that never looks past `limit` (a plain `indexOf` would scan the rest of the page for every unterminated tag). */
const indexOfWithin = (
  text: string,
  char: string,
  from: number,
  limit: number,
): number => {
  for (let index = from; index < limit; index++) {
    if (text.charAt(index) === char) {
      return index
    }
  }
  return -1
}

/** The attributes of the tag starting at `from` (just after its name), quote-aware and linear. */
const readAttributes = (
  html: string,
  from: number,
): { attributes: Map<string, string>; end: number } => {
  const attributes = new Map<string, string>()
  const limit = Math.min(html.length, from + MAX_META_TAG_CHARS)
  let index = from
  while (index < limit) {
    const char = html.charAt(index)
    if (char === ">") {
      return { attributes, end: index + 1 }
    }
    if (BLANK.test(char) || char === "/") {
      index += 1
      continue
    }
    const nameStart = index
    while (
      index < limit &&
      !BLANK.test(html.charAt(index)) &&
      !"=>/".includes(html.charAt(index))
    ) {
      index += 1
    }
    const name = asciiLower(html.slice(nameStart, index))
    while (index < limit && BLANK.test(html.charAt(index))) {
      index += 1
    }
    if (html.charAt(index) !== "=") {
      attributes.set(name, "")
      continue
    }
    index += 1
    while (index < limit && BLANK.test(html.charAt(index))) {
      index += 1
    }
    const quote = html.charAt(index)
    let value: string
    if (quote === '"' || quote === "'") {
      const close = indexOfWithin(html, quote, index + 1, limit)
      if (close === -1) {
        return { attributes, end: limit }
      }
      value = html.slice(index + 1, close)
      index = close + 1
    } else {
      const valueStart = index
      while (
        index < limit &&
        !BLANK.test(html.charAt(index)) &&
        html.charAt(index) !== ">"
      ) {
        index += 1
      }
      value = html.slice(valueStart, index)
    }
    if (!attributes.has(name)) {
      attributes.set(name, value)
    }
  }
  return { attributes, end: limit }
}

/**
 * The picture an article page names for itself: the first usable of
 * `og:image:secure_url`, `og:image`, `og:image:url`, `twitter:image`,
 * `twitter:image:src` among the `<meta>` tags of its head, resolved against the
 * final page address. A single bounded left-to-right scan (no backtracking
 * patterns): the work is linear in the head, and a page with no head end is
 * read only up to its first body tag or the size cap.
 */
export const findArticleImageUrl = (
  html: string,
  baseUrl: string,
): string | null => {
  const text =
    html.length > ARTICLE_HTML_MAX_CHARS
      ? html.slice(0, ARTICLE_HTML_MAX_CHARS)
      : html
  const lower = asciiLower(text)
  const headEnd = [lower.indexOf("</head"), lower.indexOf("<body")]
    .filter((at) => at !== -1)
    .reduce((least, at) => Math.min(least, at), text.length)
  const found = new Map<string, string>()
  let position = 0
  let tags = 0
  while (position < headEnd && tags < MAX_META_TAGS) {
    const open = lower.indexOf("<meta", position)
    if (open === -1 || open >= headEnd) {
      break
    }
    if (NAME_CHAR.test(lower.charAt(open + 5))) {
      position = open + 5
      continue
    }
    tags += 1
    const { attributes, end } = readAttributes(text, open + 5)
    const content = attributes.get("content")
    for (const attribute of KEY_ATTRIBUTES) {
      const key = asciiLower((attributes.get(attribute) ?? "").trim())
      if (content && key && !found.has(key)) {
        found.set(key, content)
      }
    }
    position = Math.max(end, open + 5)
  }
  for (const key of IMAGE_KEYS) {
    const value = found.get(key)
    if (!value) {
      continue
    }
    const link = resolveLink(toPlainText(value).trim(), baseUrl)
    if (link) {
      return link
    }
  }
  return null
}

const resolveLink = (value: string, baseUrl: string): string | null => {
  if (!value || value.length > 2048) {
    return null
  }
  try {
    return safeLink(new URL(value, baseUrl).toString())
  } catch {
    return null
  }
}
