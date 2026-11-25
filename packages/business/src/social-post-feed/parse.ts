import { XMLParser } from "fast-xml-parser"
import { requestHash } from "../social-post/hash"
import { collectFeedFields, type FeedFields } from "./fields"
import {
  type FeedImageCandidate,
  jsonImageCandidates,
  xmlImageCandidates,
} from "./images"
import {
  POST_FEED_CONTENT_MAX,
  POST_FEED_MAX_CATEGORIES,
  POST_FEED_MAX_ITEMS_PARSED,
} from "./limits"
import {
  cleanSummary,
  cleanTitle,
  safeLink,
  toPlainText,
  truncateText,
} from "./text"

/** One item of a feed, normalised. */
export type ParsedFeedItem = {
  /** The item's author as plain text (`dc:creator`, Atom `author/name`, JSON Feed `authors`). */
  author: string | null
  /** The item's tags or categories, plain text, without repeats. */
  categories: string[]
  /** The item's full text as plain text (never HTML). */
  content: string | null
  /** Title and address of the feed the item came from. */
  feedLink: string | null
  feedTitle: string | null
  /** Every element and attribute of the item as plain text; see `fields.ts` for the key format. */
  fields: FeedFields
  /** The item's best picture (an http(s) address), when the feed names one. */
  image: string | null
  /** Every picture the feed names, best first. */
  images: FeedImageCandidate[]
  itemKey: string
  link: string | null
  publishedAt: Date | null
  summary: string | null
  title: string | null
}

type FeedMeta = { link: string | null; title: string | null }

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FeedParseError"
  }
}

const MAX_XML_DEPTH = 20
const MAX_KEY_LENGTH = 500

/** `item` / `entry`, with or without a namespace prefix (`atom:entry`). */
const REPEATED_ELEMENT = /^(?:[^:]+:)?(?:item|entry)$/

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  htmlEntities: true,
  ignoreAttributes: false,
  isArray: (name) => REPEATED_ELEMENT.test(name),
  maxNestedTags: MAX_XML_DEPTH,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: {
    enabled: true,
    maxEntityCount: 0,
    maxExpandedLength: 100_000,
    maxTotalExpansions: 1000,
  },
  removeNSPrefix: false,
  textNodeName: "#text",
  trimValues: true,
})

type Node = Record<string, unknown>

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** The member of `document` named `local`, with or without a namespace prefix (an unprefixed one wins). */
const member = (document: Node, local: string): unknown => {
  const key =
    local in document
      ? local
      : Object.keys(document).find((name) => name.endsWith(`:${local}`))
  return key === undefined ? undefined : document[key]
}

/** The text of an element: a plain string, or the `#text` of one that has attributes. */
const textOf = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value.trim() || null
  }
  if (typeof value === "number") {
    return String(value)
  }
  if (isNode(value)) {
    return textOf(value["#text"])
  }
  if (Array.isArray(value)) {
    return textOf(value[0])
  }
  return null
}

const dateOf = (value: unknown): Date | null => {
  const text = textOf(value)
  if (!text) {
    return null
  }
  const time = Date.parse(text)
  return Number.isNaN(time) ? null : new Date(time)
}

/** The link of an Atom entry: the `alternate` one (or the first without a `rel`). */
const atomLink = (links: unknown): string | null => {
  const candidates = (Array.isArray(links) ? links : [links]).filter(isNode)
  const alternate =
    candidates.find(
      (link) => link["@_rel"] === undefined || link["@_rel"] === "alternate",
    ) ?? candidates[0]
  return alternate ? textOf(alternate["@_href"]) : null
}

const rssLink = (links: unknown): string | null => {
  const first = (Array.isArray(links) ? links : [links])[0]
  return textOf(first) ?? (isNode(first) ? textOf(first["@_href"]) : null)
}

const pickKey = async (parts: {
  guid: string | null
  link: string | null
  publishedAt: Date | null
  title: string | null
}): Promise<string | null> => {
  const natural = parts.guid ?? parts.link
  if (natural) {
    return natural.length > MAX_KEY_LENGTH
      ? await requestHash(natural)
      : natural
  }
  if (!parts.title) {
    return null
  }
  return await requestHash(
    `${parts.title}|${parts.publishedAt?.toISOString() ?? ""}`,
  )
}

/** The text of a possibly HTML element, kept as the source markup so a picture can be found in it. */
const markupOf = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value || null
  }
  return isNode(value) ? markupOf(value["#text"]) : null
}

const plainOrNull = (value: string | null, max: number): string | null => {
  const text = value ? toPlainText(value) : ""
  return text ? truncateText(text, max) : null
}

const AUTHOR_IN_PARENS = /\(([^)]+)\)/

/** RSS `author` is an address with the name in parentheses; Atom's is an element with a `name`. */
const xmlAuthor = (raw: Node): string | null => {
  const creator = textOf(raw["dc:creator"])
  if (creator) {
    return plainOrNull(creator, 200)
  }
  const rawAuthor = member(raw, "author")
  const author = Array.isArray(rawAuthor) ? rawAuthor[0] : rawAuthor
  const name = isNode(author) ? textOf(member(author, "name")) : textOf(author)
  if (!name) {
    return null
  }
  const parens = AUTHOR_IN_PARENS.exec(name)
  return plainOrNull(parens?.[1] ?? name, 200)
}

const addCategory = (found: string[], value: string | null): void => {
  const text = plainOrNull(value, 100)?.replace(/\s+/g, " ")
  if (
    text &&
    found.length < POST_FEED_MAX_CATEGORIES &&
    !found.some((entry) => entry.toLowerCase() === text.toLowerCase())
  ) {
    found.push(text)
  }
}

const xmlCategories = (raw: Node): string[] => {
  const found: string[] = []
  const categories = member(raw, "category")
  for (const entry of Array.isArray(categories) ? categories : [categories]) {
    addCategory(
      found,
      isNode(entry)
        ? (textOf(entry["@_term"]) ?? textOf(entry))
        : textOf(entry),
    )
  }
  for (const entry of Array.isArray(raw["dc:subject"])
    ? raw["dc:subject"]
    : [raw["dc:subject"]]) {
    addCategory(found, textOf(entry))
  }
  return found
}

const toItem = async (
  raw: unknown,
  meta: FeedMeta,
): Promise<ParsedFeedItem | null> => {
  if (!isNode(raw)) {
    return null
  }
  const link = safeLink(
    atomLink(member(raw, "link")) ?? rssLink(member(raw, "link")),
  )
  const title = cleanTitle(textOf(member(raw, "title")))
  const publishedAt =
    dateOf(member(raw, "pubDate")) ??
    dateOf(member(raw, "published")) ??
    dateOf(member(raw, "updated")) ??
    dateOf(raw["dc:date"]) ??
    dateOf(raw.date)
  const atomContent = member(raw, "content")
  const description =
    markupOf(member(raw, "description")) ?? markupOf(member(raw, "summary"))
  const fullHtml =
    markupOf(raw["content:encoded"]) ?? markupOf(atomContent) ?? description
  const summary = cleanSummary(description ?? markupOf(atomContent))
  const guid = textOf(member(raw, "guid")) ?? textOf(member(raw, "id"))
  const itemKey = await pickKey({ guid, link, publishedAt, title })
  if (!(itemKey && (title || link))) {
    return null
  }
  const images = xmlImageCandidates(raw, {
    base: link ?? meta.link,
    html: [
      markupOf(raw["content:encoded"]),
      markupOf(atomContent),
      description,
    ],
  })
  return {
    author: xmlAuthor(raw),
    categories: xmlCategories(raw),
    content: plainOrNull(fullHtml, POST_FEED_CONTENT_MAX),
    feedLink: meta.link,
    feedTitle: meta.title,
    fields: collectFeedFields(raw),
    image: images[0]?.url ?? null,
    images,
    itemKey,
    link,
    publishedAt,
    summary,
    title,
  }
}

const feedMeta = (container: Node, isAtom: boolean): FeedMeta => ({
  link: safeLink(
    isAtom
      ? atomLink(member(container, "link"))
      : rssLink(member(container, "link")),
  ),
  title: cleanTitle(textOf(member(container, "title"))),
})

const rawItemsOf = (document: Node): { items: unknown[]; meta: FeedMeta } => {
  const rss = member(document, "rss")
  if (isNode(rss)) {
    const channel = member(rss, "channel")
    if (isNode(channel)) {
      return {
        items: (member(channel, "item") as unknown[] | undefined) ?? [],
        meta: feedMeta(channel, false),
      }
    }
  }
  const atom = member(document, "feed")
  if (isNode(atom)) {
    return {
      items: (member(atom, "entry") as unknown[] | undefined) ?? [],
      meta: feedMeta(atom, true),
    }
  }
  const rdf = member(document, "RDF")
  if (isNode(rdf)) {
    const channel = member(rdf, "channel")
    return {
      items: (member(rdf, "item") as unknown[] | undefined) ?? [],
      meta: isNode(channel)
        ? feedMeta(channel, false)
        : { link: null, title: null },
    }
  }
  throw new FeedParseError("Not an RSS or Atom feed")
}

const DOCTYPE_ENTITY = /<!ENTITY/i
const JSON_FEED_VERSION =
  /^https:\/\/(www\.)?jsonfeed\.org\/version\/1(\.\d+)?\/?$/

const stringOf = (value: unknown): string | null =>
  typeof value === "string" ? value.trim() || null : null

const jsonAuthor = (raw: Node): string | null => {
  const authors = Array.isArray(raw.authors) ? raw.authors : [raw.author]
  const first = authors.find(isNode)
  return plainOrNull(first ? stringOf(first.name) : null, 200)
}

const jsonCategories = (raw: Node): string[] => {
  const found: string[] = []
  for (const tag of Array.isArray(raw.tags) ? raw.tags : []) {
    addCategory(found, stringOf(tag))
  }
  return found
}

const jsonItem = async (
  raw: unknown,
  meta: FeedMeta,
): Promise<ParsedFeedItem | null> => {
  if (!isNode(raw)) {
    return null
  }
  const link = safeLink(stringOf(raw.url) ?? stringOf(raw.external_url))
  const title = cleanTitle(stringOf(raw.title))
  const publishedAt = dateOf(raw.date_published) ?? dateOf(raw.date_modified)
  const summary = cleanSummary(
    stringOf(raw.summary) ??
      stringOf(raw.content_text) ??
      stringOf(raw.content_html),
  )
  const guid = typeof raw.id === "number" ? String(raw.id) : stringOf(raw.id)
  const itemKey = await pickKey({ guid, link, publishedAt, title })
  if (!(itemKey && (title || link))) {
    return null
  }
  const images = jsonImageCandidates(raw, link ?? meta.link)
  return {
    author: jsonAuthor(raw),
    categories: jsonCategories(raw),
    content: plainOrNull(
      stringOf(raw.content_text) ?? stringOf(raw.content_html),
      POST_FEED_CONTENT_MAX,
    ),
    feedLink: meta.link,
    feedTitle: meta.title,
    fields: collectFeedFields(raw),
    image: images[0]?.url ?? null,
    images,
    itemKey,
    link,
    publishedAt,
    summary,
    title,
  }
}

/** A JSON Feed 1 or 1.1 document, or null when `text` is not JSON at all. */
const parseJsonDocument = (text: string): Node | null => {
  if (!text.trimStart().startsWith("{")) {
    return null
  }
  try {
    const document: unknown = JSON.parse(text)
    return isNode(document) ? document : null
  } catch {
    throw new FeedParseError("The document is not valid JSON")
  }
}

const jsonItems = async (document: Node): Promise<ParsedFeedItem[]> => {
  const version = stringOf(document.version)
  if (
    !(
      version &&
      JSON_FEED_VERSION.test(version) &&
      Array.isArray(document.items)
    )
  ) {
    throw new FeedParseError("Not a JSON Feed")
  }
  const items: ParsedFeedItem[] = []
  const meta: FeedMeta = {
    link: safeLink(stringOf(document.home_page_url)),
    title: cleanTitle(stringOf(document.title)),
  }
  for (const raw of document.items) {
    const item = await jsonItem(raw, meta)
    if (item) {
      items.push(item)
    }
  }
  return items
}

/** Drops repeated keys, orders newest first and keeps at most 100. */
const finishItems = (parsed: ParsedFeedItem[]): ParsedFeedItem[] => {
  const seen = new Set<string>()
  const items = parsed.filter((item) => {
    if (seen.has(item.itemKey)) {
      return false
    }
    seen.add(item.itemKey)
    return true
  })
  return items
    .sort(
      (a, b) =>
        (b.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY) -
        (a.publishedAt?.getTime() ?? Number.NEGATIVE_INFINITY),
    )
    .slice(0, POST_FEED_MAX_ITEMS_PARSED)
}

/**
 * Parses an RSS 2.0, RSS 1.0, Atom or JSON Feed (1 and 1.1) document into at most 100 items, newest
 * first. A document that declares its own entities is refused (the only way
 * to build an expansion bomb); entity expansion is bounded as well. Items with
 * neither a title nor a link are dropped; a link that is not http(s) is
 * dropped from its item.
 */
export const parseFeed = async (xml: string): Promise<ParsedFeedItem[]> => {
  const json = parseJsonDocument(xml)
  if (json) {
    return finishItems(await jsonItems(json))
  }
  if (DOCTYPE_ENTITY.test(xml)) {
    throw new FeedParseError("Entity declarations are not allowed")
  }
  let document: unknown
  try {
    document = parser.parse(xml)
  } catch {
    throw new FeedParseError("The document is not valid XML")
  }
  if (!isNode(document)) {
    throw new FeedParseError("The document is empty")
  }
  const items: ParsedFeedItem[] = []
  const { items: rawItems, meta } = rawItemsOf(document)
  for (const raw of rawItems) {
    const item = await toItem(raw, meta)
    if (item) {
      items.push(item)
    }
  }
  return finishItems(items)
}
