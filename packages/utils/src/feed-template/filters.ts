import { removeHtmlTags } from "./html"
import type { FilterArgument, TemplateValue } from "./types"

export type FilterContext = { timeZone: string }

type FilterSpec = {
  /** Argument kinds, in order; a `?` suffix marks an optional one. */
  args: readonly ("string" | "number" | "string?" | "number?")[]
  run: (
    value: TemplateValue,
    args: FilterArgument[],
    context: FilterContext,
  ) => TemplateValue
}

const WHITESPACE_CHAR = /\s/
const MAX_FILTER_STRING = 200
const MAX_TRUNCATE = 5000
const MAX_HASHTAGS = 30
const WORD_BREAK_RATIO = 0.6
const MAX_HASHTAG_LENGTH = 60

/** The plain text of a value: an array is joined with ", ", null is empty. */
export const textOfValue = (value: TemplateValue): string => {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => textOfValue(entry as TemplateValue))
      .filter((entry) => entry !== "")
      .join(", ")
  }
  return ""
}

const listOf = (value: TemplateValue): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => textOfValue(entry as TemplateValue))
  }
  const text = textOfValue(value)
  return text ? text.split(",").map((entry) => entry.trim()) : []
}

/** Cuts to `max` characters (code points) at a word boundary when one is near, ending with an ellipsis. */
export const truncateAtWord = (text: string, max: number): string => {
  const points = Array.from(text)
  if (points.length <= max) {
    return text
  }
  const head = points.slice(0, Math.max(0, max - 1))
  let cut = head.length
  for (let index = head.length - 1; index > 0; index--) {
    if (WHITESPACE_CHAR.test(head[index] ?? "")) {
      if (index >= head.length * WORD_BREAK_RATIO) {
        cut = index
      }
      break
    }
  }
  return `${head.slice(0, cut).join("").trimEnd()}…`
}

const capitalizeWord = (word: string): string => {
  const [first, ...rest] = Array.from(word)
  return first ? first.toLocaleUpperCase() + rest.join("") : ""
}

const HASHTAG_SPLIT = /[^\p{L}\p{N}]+/u
const DIGITS_ONLY = /^\p{N}+$/u

/** `Food & Drink` -> `#FoodDrink`; letters of any script (Vietnamese included) are kept. */
export const hashtagOf = (category: string): string | null => {
  const body = category
    .split(HASHTAG_SPLIT)
    .filter(Boolean)
    .map(capitalizeWord)
    .join("")
  if (!body || DIGITS_ONLY.test(body) || body.length > MAX_HASHTAG_LENGTH) {
    return null
  }
  return `#${body}`
}

export const hashtagsOf = (values: readonly string[], max: number): string => {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of values) {
    const tag = hashtagOf(value)
    const key = tag?.toLocaleLowerCase()
    if (tag && key && !seen.has(key)) {
      seen.add(key)
      tags.push(tag)
      if (tags.length >= max) {
        break
      }
    }
  }
  return tags.join(" ")
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]
const SHORT_LENGTH = 3
const TWO_DIGITS = 2

const pad = (value: number): string => String(value).padStart(TWO_DIGITS, "0")

type ZonedParts = {
  day: number
  hour: number
  minute: number
  month: number
  second: number
  weekday: number
  year: number
}

const zonedParts = (date: Date, timeZone: string): ZonedParts | null => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      hour: "numeric",
      hourCycle: "h23",
      minute: "numeric",
      month: "numeric",
      second: "numeric",
      timeZone,
      weekday: "short",
      year: "numeric",
    }).formatToParts(date)
    const get = (type: string): string =>
      parts.find((part) => part.type === type)?.value ?? ""
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
      get("weekday"),
    )
    return {
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
      month: Number(get("month")),
      second: Number(get("second")),
      weekday,
      year: Number(get("year")),
    }
  } catch {
    return null
  }
}

/** strftime-style: %Y %y %m %d %e %H %M %S %B %b %A %a %%; anything else is kept as written. */
export const formatDate = (
  value: string,
  format: string,
  timeZone: string,
): string => {
  const time = Date.parse(value)
  if (Number.isNaN(time)) {
    return ""
  }
  const parts = zonedParts(new Date(time), timeZone)
  if (!parts) {
    return ""
  }
  const month = MONTHS[parts.month - 1] ?? ""
  const weekday = WEEKDAYS[parts.weekday] ?? ""
  const map: Record<string, string> = {
    "%": "%",
    A: weekday,
    B: month,
    H: pad(parts.hour),
    M: pad(parts.minute),
    S: pad(parts.second),
    Y: String(parts.year),
    a: weekday.slice(0, SHORT_LENGTH),
    b: month.slice(0, SHORT_LENGTH),
    d: pad(parts.day),
    e: String(parts.day),
    m: pad(parts.month),
    y: pad(parts.year % 100),
  }
  return format.replace(/%([%ABHMSYabdemy])/g, (_match, key: string) =>
    key in map ? (map[key] as string) : _match,
  )
}

const BR_TAG = /^<br\s*\/?>$/i
const TRACKING_PARAM = /^(utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid|igshid)$/i

const HTML_ENTITY = /&(nbsp|amp|lt|gt|quot);/gi
const HTML_ENTITY_TEXT: Readonly<Record<string, string>> = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
}

/** Strips tags and decodes the five basic entities in ONE pass, so `&amp;lt;` stays `&lt;`, not `<`. */
export const stripHtml = (text: string): string =>
  removeHtmlTags(text, { breakTag: BR_TAG })
    .replace(
      HTML_ENTITY,
      (_match, name: string) => HTML_ENTITY_TEXT[name.toLowerCase()] ?? _match,
    )
    .replace(/[ \t]+/g, " ")
    .trim()

export const removeTracking = (text: string): string => {
  try {
    const url = new URL(text)
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) {
        url.searchParams.delete(key)
      }
    }
    return url.toString()
  } catch {
    return text
  }
}

const numberArg = (args: FilterArgument[], index: number): number =>
  Number(args[index] ?? 0)

const stringArg = (args: FilterArgument[], index: number): string =>
  String(args[index] ?? "")

const isEmptyValue = (value: TemplateValue): boolean =>
  value === null ||
  value === undefined ||
  value === false ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0)

export const FILTERS: Readonly<Record<string, FilterSpec>> = {
  capitalize: {
    args: [],
    run: (value) => {
      const text = textOfValue(value).toLocaleLowerCase()
      return capitalizeWord(text)
    },
  },
  date: {
    args: ["string"],
    run: (value, args, context) =>
      formatDate(textOfValue(value), stringArg(args, 0), context.timeZone),
  },
  default: {
    args: ["string"],
    run: (value, args) => (isEmptyValue(value) ? stringArg(args, 0) : value),
  },
  downcase: {
    args: [],
    run: (value) => textOfValue(value).toLocaleLowerCase(),
  },
  first: {
    args: [],
    run: (value) => (Array.isArray(value) ? (value[0] ?? "") : value),
  },
  hashtags: {
    args: ["number?"],
    run: (value, args) =>
      hashtagsOf(
        listOf(value),
        Math.min(args.length > 0 ? numberArg(args, 0) : 5, MAX_HASHTAGS),
      ),
  },
  join: {
    args: ["string?"],
    run: (value, args) =>
      listOf(value)
        .filter((entry) => entry !== "")
        .join(args.length > 0 ? stringArg(args, 0) : ", "),
  },
  last: {
    args: [],
    run: (value) => (Array.isArray(value) ? (value.at(-1) ?? "") : value),
  },
  remove_utm: {
    args: [],
    run: (value) => removeTracking(textOfValue(value)),
  },
  replace: {
    args: ["string", "string?"],
    run: (value, args) => {
      const search = stringArg(args, 0)
      // The parser rejects an empty search; never expand on one regardless.
      if (search === "") {
        return textOfValue(value)
      }
      return textOfValue(value).split(search).join(stringArg(args, 1))
    },
  },
  size: {
    args: [],
    run: (value) =>
      Array.isArray(value)
        ? value.length
        : Array.from(textOfValue(value)).length,
  },
  strip_html: { args: [], run: (value) => stripHtml(textOfValue(value)) },
  truncate: {
    args: ["number"],
    run: (value, args) =>
      truncateAtWord(textOfValue(value), Math.max(1, numberArg(args, 0))),
  },
  upcase: {
    args: [],
    run: (value) => textOfValue(value).toLocaleUpperCase(),
  },
}

/** The filter of that name; an inherited `Object.prototype` member is never one. */
export const getFilter = (name: string): FilterSpec | undefined =>
  Object.hasOwn(FILTERS, name) ? FILTERS[name] : undefined

export const FILTER_NAMES: readonly string[] = Object.keys(FILTERS)
export const MAX_FILTER_STRING_LENGTH = MAX_FILTER_STRING
export const MAX_TRUNCATE_LENGTH = MAX_TRUNCATE

/** Truthiness as the `{{#if}}` block reads it. */
export const isTruthy = (value: TemplateValue): boolean => {
  if (typeof value === "number") {
    return value !== 0
  }
  return !isEmptyValue(value)
}
