import type { TemplateData } from "@chatbotx.io/utils/feed-template"
import type { FeedFields } from "./fields"

/** What the template variables are built from; a parsed item is one. */
export type FeedTemplateSource = {
  author: string | null
  categories: readonly string[]
  content: string | null
  feedLink: string | null
  feedTitle: string | null
  fields: FeedFields
  image: string | null
  link: string | null
  publishedAt: Date | null
  summary: string | null
  title: string | null
}

const WWW_PREFIX = /^www\./

const hostOf = (value: string | null): string => {
  if (!value) {
    return ""
  }
  try {
    return new URL(value).hostname.replace(WWW_PREFIX, "")
  } catch {
    return ""
  }
}

/** A null-prototype copy, so a template can only ever read the keys written here. */
const bare = <Value>(entries: Record<string, Value>): Record<string, Value> =>
  Object.assign(Object.create(null) as Record<string, Value>, entries)

/**
 * The variables a v2 template can read: `title link summary content author
 * categories date image feed.title feed.link site raw[...]`. All plain text
 * (or a list of plain texts); a variable the item lacks is an empty text, so
 * `{{#if image}}` and `| default:` work. `image` is the picture the post will
 * use when it is known, else the feed's first candidate.
 */
export const feedTemplateData = (
  item: FeedTemplateSource,
  image: string | null = item.image,
): TemplateData =>
  bare({
    author: item.author ?? "",
    categories: [...item.categories],
    content: item.content ?? "",
    date: item.publishedAt?.toISOString() ?? "",
    feed: bare({ link: item.feedLink ?? "", title: item.feedTitle ?? "" }),
    image: image ?? "",
    link: item.link ?? "",
    raw: bare(item.fields),
    site: hostOf(item.feedLink) || hostOf(item.link),
    summary: item.summary ?? "",
    title: item.title ?? "",
  })

/** The variable names a v2 template can use (shown by the editor's "Insert field" menu). */
export const FEED_TEMPLATE_VARIABLES: readonly string[] = [
  "title",
  "link",
  "summary",
  "content",
  "author",
  "categories",
  "date",
  "image",
  "feed.title",
  "feed.link",
  "site",
]
