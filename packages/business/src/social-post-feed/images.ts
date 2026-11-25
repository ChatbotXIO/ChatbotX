import { findImgTags } from "@chatbotx.io/utils/feed-template"
import { safeLink } from "./text"

/** Where a candidate picture came from, in the order the feed is searched. */
export type FeedImageCandidateSource =
  | "enclosure"
  | "mediaContent"
  | "mediaThumbnail"
  | "itunesImage"
  | "contentImage"
  | "jsonFeed"

export type FeedImageCandidate = {
  source: FeedImageCandidateSource
  url: string
}

export const MAX_IMAGE_CANDIDATES = 8
const MAX_TRACKER_PIXELS = 2
const IMAGE_TYPE = /^image\//i
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif)(\?|#|$)/i
const ATTRIBUTE = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
const TRACKER_HINT =
  /(?:^|[/_.-])(pixel|spacer|tracking|beacon|1x1)(?:[/_.-]|$)/i

type Node = Record<string, unknown>
const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const list = (value: unknown): Node[] =>
  (Array.isArray(value) ? value : [value]).filter(isNode)

const text = (value: unknown): string | null =>
  typeof value === "string" ? value.trim() || null : null

const resolveUrl = (
  value: string | null,
  base: string | null,
): string | null => {
  if (!value) {
    return null
  }
  try {
    return safeLink(new URL(value, base ?? undefined).toString())
  } catch {
    return null
  }
}

const acceptsMedia = (media: Node): boolean => {
  const type = text(media["@_type"])
  const medium = text(media["@_medium"])
  if (type) {
    return IMAGE_TYPE.test(type)
  }
  if (medium) {
    return medium === "image"
  }
  return IMAGE_EXTENSION.test(text(media["@_url"]) ?? "")
}

/** Attribute map of one `<img>` tag. */
const attributesOf = (tag: string): Record<string, string> => {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(ATTRIBUTE)) {
    attributes[(match[1] as string).toLowerCase()] = match[2] ?? match[3] ?? ""
  }
  return attributes
}

const isTracker = (attributes: Record<string, string>): boolean => {
  const size = (value: string | undefined): number | null => {
    const number = Number.parseInt(value ?? "", 10)
    return Number.isFinite(number) ? number : null
  }
  const width = size(attributes.width)
  const height = size(attributes.height)
  return (
    (width !== null && width <= MAX_TRACKER_PIXELS) ||
    (height !== null && height <= MAX_TRACKER_PIXELS) ||
    TRACKER_HINT.test(attributes.src ?? "")
  )
}

/** The first real `<img>` of an HTML fragment (absolute against `base`; tracking pixels skipped). */
export const firstImageInHtml = (
  html: string | null,
  base: string | null,
): string | null => {
  if (!html) {
    return null
  }
  for (const tag of findImgTags(html)) {
    const attributes = attributesOf(tag)
    const source = attributes.src || attributes["data-src"]
    if (!isTracker(attributes)) {
      const url = resolveUrl(source?.trim() || null, base)
      if (url) {
        return url
      }
    }
  }
  return null
}

/** Pictures of one RSS, Atom or RDF item element, best first, without repeats. */
export const xmlImageCandidates = (
  raw: Node,
  context: { base: string | null; html: (string | null)[] },
): FeedImageCandidate[] => {
  const found: FeedImageCandidate[] = []
  const add = (source: FeedImageCandidateSource, value: string | null) => {
    const url = resolveUrl(value, context.base)
    if (url && !found.some((entry) => entry.url === url)) {
      found.push({ source, url })
    }
  }
  for (const enclosure of list(raw.enclosure)) {
    if (IMAGE_TYPE.test(text(enclosure["@_type"]) ?? "")) {
      add("enclosure", text(enclosure["@_url"]))
    }
  }
  for (const link of list(raw.link)) {
    if (
      link["@_rel"] === "enclosure" &&
      IMAGE_TYPE.test(text(link["@_type"]) ?? "")
    ) {
      add("enclosure", text(link["@_href"]))
    }
  }
  const groups = list(raw["media:group"])
  const contents = [
    ...list(raw["media:content"]),
    ...groups.flatMap((group) => list(group["media:content"])),
  ]
  for (const media of contents) {
    if (acceptsMedia(media)) {
      add("mediaContent", text(media["@_url"]))
    }
  }
  const thumbnails = [
    ...list(raw["media:thumbnail"]),
    ...groups.flatMap((group) => list(group["media:thumbnail"])),
    ...contents.flatMap((media) => list(media["media:thumbnail"])),
  ]
  for (const thumbnail of thumbnails) {
    add("mediaThumbnail", text(thumbnail["@_url"]))
  }
  for (const itunes of list(raw["itunes:image"])) {
    add("itunesImage", text(itunes["@_href"]))
  }
  for (const html of context.html) {
    add("contentImage", firstImageInHtml(html, context.base))
  }
  return found.slice(0, MAX_IMAGE_CANDIDATES)
}

/** Pictures of one JSON Feed item. */
export const jsonImageCandidates = (
  raw: Node,
  base: string | null,
): FeedImageCandidate[] => {
  const found: FeedImageCandidate[] = []
  for (const value of [raw.image, raw.banner_image]) {
    const url = resolveUrl(text(value), base)
    if (url && !found.some((entry) => entry.url === url)) {
      found.push({ source: "jsonFeed", url })
    }
  }
  const html = text(raw.content_html)
  const inline = firstImageInHtml(html, base)
  if (inline && !found.some((entry) => entry.url === inline)) {
    found.push({ source: "contentImage", url: inline })
  }
  return found
}
