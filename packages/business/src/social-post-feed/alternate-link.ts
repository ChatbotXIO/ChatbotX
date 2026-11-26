const WHITESPACE = /\s+/
const LINK_TAG = /<link\b[^>]*>/gi
const ATTRIBUTE = /([a-zA-Z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
const FEED_TYPES: ReadonlySet<string> = new Set([
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
])
/** Only the head of a page is searched; a page that long without a feed link has none. */
const MAX_SCANNED_CHARS = 200_000

const attributesOf = (tag: string): Map<string, string> => {
  const attributes = new Map<string, string>()
  for (const match of tag.matchAll(ATTRIBUTE)) {
    const name = match[1]?.toLowerCase()
    if (name && !attributes.has(name)) {
      attributes.set(name, match[2] ?? match[3] ?? "")
    }
  }
  return attributes
}

/**
 * The feed a web page advertises with `<link rel="alternate"
 * type="application/rss+xml|atom+xml|feed+json" href>`, resolved against the page address.
 * Only an http(s) address is returned; the caller still vets it before use.
 */
export const findAlternateFeedUrl = (
  html: string,
  pageUrl: string,
): string | null => {
  for (const [tag] of html.slice(0, MAX_SCANNED_CHARS).matchAll(LINK_TAG)) {
    const attributes = attributesOf(tag)
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(WHITESPACE)
    const type = (attributes.get("type") ?? "").trim().toLowerCase()
    const href = attributes.get("href")?.trim()
    if (!(href && rel.includes("alternate") && FEED_TYPES.has(type))) {
      continue
    }
    try {
      const resolved = new URL(href, pageUrl)
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        return resolved.toString()
      }
    } catch {
      // A malformed href is not a suggestion.
    }
  }
  return null
}
