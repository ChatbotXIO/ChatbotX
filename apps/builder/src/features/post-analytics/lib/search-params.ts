import {
  channelPostContentTypes,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { parseAsArrayOf, parseAsString, parseAsStringEnum } from "nuqs"
import type { z } from "zod"
import {
  type postAnalyticsFiltersRequest,
  postAnalyticsGroupBy,
  postAnalyticsRankBy,
  postMetricName,
} from "../schema"

export type PostAnalyticsScope = Pick<
  z.input<typeof postAnalyticsFiltersRequest>,
  "channels" | "contentTypes" | "from" | "inboxIds" | "to" | "topicIds"
>

/**
 * The Posts analytics section's URL state: every filter is shareable and
 * survives reload. `channels` and `inboxIds` are the dashboard's shared row.
 */
export const analyticsSearchParsers = {
  channels: parseAsArrayOf(
    parseAsStringEnum([...channelTypes.options]),
  ).withDefault([]),
  contentTypes: parseAsArrayOf(
    parseAsStringEnum([...channelPostContentTypes.options]),
  ).withDefault([]),
  from: parseAsString,
  groupBy: parseAsStringEnum([...postAnalyticsGroupBy.options]).withDefault(
    "none",
  ),
  inboxIds: parseAsArrayOf(parseAsString).withDefault([]),
  metric: parseAsStringEnum([...postMetricName.options]).withDefault(
    "engagement",
  ),
  rankBy: parseAsStringEnum([...postAnalyticsRankBy.options]).withDefault(
    "gained",
  ),
  to: parseAsString,
  topicIds: parseAsArrayOf(parseAsString).withDefault([]),
}

type AnalyticsFilterState = {
  channels: readonly string[]
  contentTypes: readonly string[]
  from: string | null
  inboxIds: readonly string[]
  to: string | null
  topicIds: readonly string[]
}

const orUndefined = <Item>(items: readonly Item[]): Item[] | undefined =>
  items.length > 0 ? [...items] : undefined

/**
 * The scope every analytics read shares, from the URL state. Empty filters and
 * a missing range are omitted: the server then reads all channels and the last
 * 30 days in the workspace time zone.
 */
export const toAnalyticsScope = (
  filters: AnalyticsFilterState,
): PostAnalyticsScope => {
  // Not narrowed to post-capable channels: the dashboard's shared row can pick
  // any channel, and a channel without posts must read as "no data", not as
  // "all channels".
  const channels = channelTypes.options.filter((channel) =>
    filters.channels.includes(channel),
  )
  const contentTypes = channelPostContentTypes.options.filter((type) =>
    filters.contentTypes.includes(type),
  )
  return {
    channels: orUndefined(channels),
    contentTypes: orUndefined(contentTypes),
    from: filters.from ?? undefined,
    inboxIds: orUndefined(filters.inboxIds),
    to: filters.to ?? undefined,
    topicIds: orUndefined(filters.topicIds),
  }
}
