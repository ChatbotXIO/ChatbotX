import { toPlainText, truncateText } from "./text"

/**
 * The raw fields of a feed item, flattened to plain text under deterministic
 * keys, so a template can reach an element or attribute the product never
 * modelled (`raw["g:price"]`, `raw["media:content@url"]`).
 *
 * Format, version {@link FEED_FIELD_FORMAT_VERSION}:
 * - a key is the element path below the item, steps joined with `/`, each step
 *   as written in the document INCLUDING its namespace prefix (`dc:creator`,
 *   `media:group/media:content`); a JSON Feed property path uses the same form;
 * - the first element of a name has the bare key, the next ones `name[1]`,
 *   `name[2]`, ...; when a name repeats, `name[]` holds every occurrence's text
 *   as a list (the same name at other nesting levels is a different key);
 * - an attribute is the element's key plus `@name` (`enclosure@url`);
 * - every value is trimmed plain text (markup, entities and control characters
 *   removed), at most {@link FEED_FIELD_VALUE_MAX} characters; empty values are
 *   left out; HTML is never exposed.
 * The whole map is bounded in keys, bytes, depth and key length; what does not
 * fit is dropped in document order.
 */
export const FEED_FIELD_FORMAT_VERSION = 1
export const FEED_FIELD_MAX_KEYS = 100
export const FEED_FIELD_VALUE_MAX = 2048
export const FEED_FIELD_MAX_BYTES = 24 * 1024
export const FEED_FIELD_MAX_DEPTH = 4
export const FEED_FIELD_MAX_KEY_LENGTH = 120
export const FEED_FIELD_MAX_LIST = 20

export type FeedFieldValue = string | string[]
export type FeedFields = Record<string, FeedFieldValue>

type Node = Record<string, unknown>
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const ATTRIBUTE_PREFIX = "@_"
const TEXT_KEY = "#text"

const WHITESPACE = /\s+/g
const TRAILING_ELLIPSIS = /…$/

const scalarText = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value
  }
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : null
}

/** A feed field value: scalars become text, markup is removed. */
const plain = (value: unknown): string | null => {
  const text = scalarText(value)
  if (text === null) {
    return null
  }
  const clean = toPlainText(text).replace(WHITESPACE, " ").trim()
  return clean
    ? truncateText(clean, FEED_FIELD_VALUE_MAX).replace(TRAILING_ELLIPSIS, "")
    : null
}

class Collector {
  readonly fields: FeedFields = Object.create(null) as FeedFields
  private bytes = 0
  private keys = 0

  get full(): boolean {
    return (
      this.keys >= FEED_FIELD_MAX_KEYS || this.bytes >= FEED_FIELD_MAX_BYTES
    )
  }

  set(key: string, value: FeedFieldValue | null): void {
    if (
      value === null ||
      this.full ||
      key.length > FEED_FIELD_MAX_KEY_LENGTH ||
      key in this.fields
    ) {
      return
    }
    const size = Array.isArray(value)
      ? value.reduce((sum, entry) => sum + entry.length, 0)
      : value.length
    if (this.bytes + size > FEED_FIELD_MAX_BYTES) {
      return
    }
    this.fields[key] = value
    this.keys += 1
    this.bytes += size
  }
}

/** The text an element or JSON value stands for (its own text, not its children's). */
const ownText = (value: unknown): string | null => {
  if (isNode(value)) {
    return plain(value[TEXT_KEY])
  }
  return plain(value)
}

const visit = (
  collector: Collector,
  path: string,
  value: unknown,
  depth: number,
): void => {
  if (collector.full) {
    return
  }
  collector.set(path, ownText(value))
  if (!isNode(value) || depth >= FEED_FIELD_MAX_DEPTH) {
    return
  }
  for (const [name, child] of Object.entries(value)) {
    if (name === TEXT_KEY) {
      continue
    }
    if (name.startsWith(ATTRIBUTE_PREFIX)) {
      collector.set(
        `${path}@${name.slice(ATTRIBUTE_PREFIX.length)}`,
        plain(child),
      )
      continue
    }
    const occurrences = Array.isArray(child) ? child : [child]
    const texts: string[] = []
    for (const [index, occurrence] of occurrences.entries()) {
      const step = index === 0 ? name : `${name}[${index}]`
      visit(collector, `${path}/${step}`, occurrence, depth + 1)
      const text = ownText(occurrence)
      if (text && texts.length < FEED_FIELD_MAX_LIST) {
        texts.push(text)
      }
    }
    if (occurrences.length > 1 && texts.length > 0) {
      collector.set(`${path}/${name}[]`, texts)
    }
  }
}

/** The flattened fields of one item element or JSON Feed item. Never throws. */
export const collectFeedFields = (item: Node): FeedFields => {
  const collector = new Collector()
  for (const [name, child] of Object.entries(item)) {
    if (name === TEXT_KEY) {
      continue
    }
    if (name.startsWith(ATTRIBUTE_PREFIX)) {
      collector.set(`@${name.slice(ATTRIBUTE_PREFIX.length)}`, plain(child))
      continue
    }
    const occurrences = Array.isArray(child) ? child : [child]
    const texts: string[] = []
    for (const [index, occurrence] of occurrences.entries()) {
      const step = index === 0 ? name : `${name}[${index}]`
      visit(collector, step, occurrence, 1)
      const text = ownText(occurrence)
      if (text && texts.length < FEED_FIELD_MAX_LIST) {
        texts.push(text)
      }
    }
    if (occurrences.length > 1 && texts.length > 0) {
      collector.set(`${name}[]`, texts)
    }
  }
  return collector.fields
}
