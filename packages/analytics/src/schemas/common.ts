import { zodBigintAsString, zodBigintIdAsString } from "@chatbotx.io/utils"
import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import { z } from "zod"

const FROM_FLOOR = new Date("2020-01-01T00:00:00.000Z")

export const timeRangeQuerySchema = z.object({
  from: z
    .string()
    .transform((val) => {
      const d = new Date(val)
      return d < FROM_FLOOR ? FROM_FLOOR : d
    })
    .describe(
      "ISO 8601 start of the time range (inclusive). Clamped to 2020-01-01 at the earliest.",
    ),
  to: z
    .string()
    .transform((val) => new Date(val))
    .describe("ISO 8601 end of the time range (inclusive)."),
  timezone: z
    .string()
    .default("UTC")
    .describe("IANA timezone used to bucket results, e.g. `America/New_York`."),
  workspaceId: zodBigintAsString(),
})
export type TimeRangeQuery = z.infer<typeof timeRangeQuerySchema>

export const granularityDayHourMinuteSchema = z.enum(["minute", "hour", "day"])
export const granularityDayMonthSchema = z.enum(["day", "month"])

export const timeRangeQueryWithGranularityMHDSchema =
  timeRangeQuerySchema.extend({
    granularity: granularityDayHourMinuteSchema
      .default("day")
      .describe("Bucket size for the returned time series."),
  })

export const timeRangeQueryWithGranularityDMSchema =
  timeRangeQuerySchema.extend({
    granularity: granularityDayMonthSchema
      .default("day")
      .describe("Bucket size for the returned time series."),
  })

export const contactInfoSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  avatar: z.string().nullable(),
})
export type ContactInfo = z.infer<typeof contactInfoSchema>

export const contactEventData = z.object({
  contactId: z.string(),
  contactInboxId: z.string(),
  occurredAt: z.string(),
  sourceId: z.string().optional(),
  channel: z.string().optional(),
  conversationId: z.string().optional(),
  errorContent: z.string().nullable().optional(),
})

export type ContactEventData = z.infer<typeof contactEventData>

/**
 * Most inbox ids one request may name (the Inbox picker enforces it too). 200
 * bigint ids stay well inside a GET query string (~7 KB with the indexed
 * bracket encoding); "everything ticked" sends no list at all.
 */
export const MAX_ANALYTICS_FILTER_VALUES = 200

/**
 * Optional dashboard filters shared by every analytics procedure that reads an
 * event table carrying `channel` / `inboxId`. Empty or absent = "All".
 * `channels AND inboxIds` apply together. Events recorded before filtering
 * existed have no `inboxId`, and older bot-message and conversation events have
 * no `channel` either, so a filter only counts the events that carry them.
 */
/**
 * OpenAPI query parsing keeps a single `?channels=messenger` as a string and
 * only builds an array for repeated or indexed keys, so wrap a lone value.
 * The generated spec still documents an array.
 */
const queryArray = <T extends z.ZodType>(item: T, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? [value] : value),
    z.array(item).max(max),
  )

export const analyticsFilterFields = {
  channels: queryArray(channelTypes, channelTypes.options.length)
    .optional()
    .describe(
      "Only include these channels. Omit or leave empty for all. Older bot-message and conversation events carry no channel and are only counted when this is omitted.",
    ),
  inboxIds: queryArray(zodBigintIdAsString(), MAX_ANALYTICS_FILTER_VALUES)
    .optional()
    .describe(
      "Only include these inboxes. Get ids from `analytics.filterOptions`. Omit or leave empty for all. Events recorded before inbox tracking existed carry no inbox and are only counted when this is omitted.",
    ),
}

export const timeRangeQueryWithFilterSchema = timeRangeQuerySchema.extend(
  analyticsFilterFields,
)
export type TimeRangeQueryWithFilter = z.infer<
  typeof timeRangeQueryWithFilterSchema
>

export const timeRangeQueryWithGranularityMHDFilterSchema =
  timeRangeQueryWithGranularityMHDSchema.extend(analyticsFilterFields)

export const timeRangeQueryWithGranularityDMFilterSchema =
  timeRangeQueryWithGranularityDMSchema.extend(analyticsFilterFields)

export type AnalyticsFilter = {
  channels?: readonly ChannelType[] | undefined
  inboxIds?: readonly string[] | undefined
}

export type NormalizedAnalyticsFilter = {
  channels: ChannelType[]
  inboxIds: string[]
}

const dedupeSorted = <T extends string>(
  values: readonly T[] | undefined,
): T[] => [...new Set(values ?? [])].sort()

/** Dedupes + sorts so equal filters produce equal SQL and cache keys. */
export function normalizeAnalyticsFilters(
  filter: AnalyticsFilter | undefined,
): NormalizedAnalyticsFilter {
  return {
    channels: dedupeSorted(filter?.channels),
    inboxIds: dedupeSorted(filter?.inboxIds),
  }
}

export function hasAnalyticsFilter(
  filter: AnalyticsFilter | undefined,
): boolean {
  const normalized = normalizeAnalyticsFilters(filter)
  return normalized.channels.length > 0 || normalized.inboxIds.length > 0
}

/** Stable cache-key suffix; absent and empty filters produce the same key. */
export function analyticsFilterCacheKey(
  filter: AnalyticsFilter | undefined,
): string {
  const { channels, inboxIds } = normalizeAnalyticsFilters(filter)
  return `c=${channels.join(",")}:i=${inboxIds.join(",")}`
}

type TimeRangeCacheInput = AnalyticsFilter & {
  workspaceId: string
  from: Date
  to: Date
  timezone: string
}

/**
 * Cache key for a range-bound analytics read, shared by the private route and
 * the public procedure so identical inputs hit the same entry. Filters are
 * normalized, so absent and empty filters share a key and different filters
 * never collide.
 */
export const analyticsTimeRangeCacheKey = (
  route: string,
  input: TimeRangeCacheInput,
): string =>
  `analytics:${route}:${input.workspaceId}:${input.from.toISOString()}:${input.to.toISOString()}:${input.timezone}:${analyticsFilterCacheKey(input)}`

export type FilteredTimeRangeQuery = TimeRangeQuery & AnalyticsFilter
