import {
  leaderboardPlatforms,
  leaderboardStatuses,
} from "@chatbotx.io/database/partials"
import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server"

/** Tabs on the list page; drafts only show under "all". */
export const LEADERBOARD_STATUS_TABS = [
  "all",
  "active",
  "paused",
  "finished",
] as const
export type LeaderboardStatusTab = (typeof LEADERBOARD_STATUS_TABS)[number]

export const listLeaderboardsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  // Column filter keys of the table toolbar (`useDataTable`).
  name: parseAsString,
  platform: parseAsArrayOf(parseAsString, ","),
  status: parseAsStringLiteral(LEADERBOARD_STATUS_TABS).withDefault("all"),
}
export const listLeaderboardsSearchParamsCache = createSearchParamsCache(
  listLeaderboardsSearchParams,
)

export const LEADERBOARD_PARTICIPANT_FILTERS = [
  "all",
  "top10",
  "top50",
  "banned",
] as const

export const listParticipantsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(20),
  participant: parseAsString,
  filter: parseAsStringLiteral(LEADERBOARD_PARTICIPANT_FILTERS).withDefault(
    "all",
  ),
}
export const listParticipantsSearchParamsCache = createSearchParamsCache(
  listParticipantsSearchParams,
)

/** First valid platform of the toolbar's (array) filter value. */
export function parsePlatformFilter(value: string[] | null) {
  const parsed = leaderboardPlatforms.safeParse(value?.[0])
  return parsed.success ? parsed.data : null
}

export function parseStatusTab(tab: LeaderboardStatusTab) {
  return tab === "all" ? null : leaderboardStatuses.parse(tab)
}
