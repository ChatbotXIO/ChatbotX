import {
  type SocialPostFeedErrorCode,
  socialPostFeedErrorCodes,
} from "@chatbotx.io/database/partials"

/** Minutes between checks a person can pick (the API accepts any value from 15 to 1440). */
export const FEED_INTERVAL_CHOICES = [15, 30, 60, 180, 360, 720, 1440] as const
export const FEED_DEFAULT_INTERVAL_MINUTES = 60
export const FEED_DEFAULT_DAILY_CAP = 10
export const FEED_MAX_DAILY_CAP = 10
export const FEED_DEFAULT_TEMPLATE = "{{ title }}\n{{ link }}"
export const FEED_MAX_AI_INSTRUCTIONS_LENGTH = 300
export const FEED_MAX_NAME_LENGTH = 100
export const FEED_MAX_TEMPLATE_LENGTH = 5000
/** The variables every item has; shown by the "Insert field" menu. */
export const FEED_TEMPLATE_VARIABLES = [
  "title",
  "link",
  "summary",
  "content",
  "author",
  "categories",
  "date",
  "image",
  "feed.title",
  "site",
] as const
/** Filters offered after a field, with the example the menu inserts. */
export const FEED_FILTER_EXAMPLES = {
  truncate: "truncate: 120",
  hashtags: "hashtags: 5",
  date: 'date: "%d/%m/%Y"',
  default: 'default: ""',
} as const
/** Examples shown as placeholders and in help texts (they hold braces, so they travel as values). */
export const FEED_TEMPLATE_EXAMPLE = "{{ title | truncate: 100 }}"
export const FEED_MEDIA_FIELD_EXAMPLE = '{{ raw["media:content@url"] }}'
export const FEED_FILTER_NAMES =
  "truncate, hashtags, date, default, upcase, downcase, replace, strip_html, remove_utm, join"
export const FEED_MAX_FILTER_TERMS = 20
export const FEED_MAX_FALLBACK_PICTURES = 10
export const FEED_MAX_AGE_HOURS_LIMIT = 168

export const FEED_TEMPLATE_PRESETS = {
  presetProduct:
    '{{ title }}\n{{#if raw["g:price"]}}{{ raw["g:price"] }}{{/if}}\n{{ link }}',
  presetSummaryHashtags:
    "{{ title }}\n\n{{ summary | truncate: 200 }}\n\n{{ link }}\n{{ categories | hashtags: 4 }}",
  presetTitleLink: "{{ title }}\n{{ link }}",
} as const

/** The stored error code of a feed, when it is one the page has a message for. */
export const knownFeedErrorCode = (
  code: string | null,
): SocialPostFeedErrorCode | null => {
  const parsed = socialPostFeedErrorCodes.safeParse(code)
  return parsed.success ? parsed.data : null
}
