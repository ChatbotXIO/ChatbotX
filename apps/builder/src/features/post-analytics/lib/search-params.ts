import { channelPostContentTypes } from "@chatbotx.io/database/partials"
import { POST_MANAGEMENT_CHANNELS } from "@chatbotx.io/utils/channel"
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

/** The Analytics tab's URL state: every filter is shareable and survives reload. */
export const analyticsSearchParsers = {
  channels: parseAsArrayOf(
    parseAsStringEnum([...POST_MANAGEMENT_CHANNELS]),
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
  const channels = POST_MANAGEMENT_CHANNELS.filter((channel) =>
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
