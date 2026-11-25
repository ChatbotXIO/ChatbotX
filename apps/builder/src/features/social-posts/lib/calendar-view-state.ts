import { socialProviders } from "@chatbotx.io/utils/social-account"
import { socialPostBuckets } from "@chatbotx.io/utils/social-post"
import { parseAsString, parseAsStringLiteral } from "nuqs"
import type { CalendarRange } from "@/components/calendar/calendar-grid"

export const POSTS_CALENDAR_VIEWS = ["month", "week", "day", "list"] as const
export type PostsCalendarView = (typeof POSTS_CALENDAR_VIEWS)[number]

/** The list's state filter: every post, or one bucket the counts are grouped by. */
export const POSTS_LIST_FILTERS = ["all", ...socialPostBuckets.options] as const
export type PostsListFilter = (typeof POSTS_LIST_FILTERS)[number]

/** The visible span each view queries: the list shows a whole month as an agenda. */
export const VIEW_RANGE: Record<PostsCalendarView, CalendarRange> = {
  day: "day",
  list: "month",
  month: "month",
  week: "week",
}

/** The URL state of the calendar; `view` stays unset until chosen so a phone can default to the list. */
export const calendarSearchParsers = {
  date: parseAsString,
  destination: parseAsString,
  provider: parseAsStringLiteral(socialProviders.options),
  /** Unset means "all"; only the list view reads it. */
  status: parseAsStringLiteral(POSTS_LIST_FILTERS),
  view: parseAsStringLiteral(POSTS_CALENDAR_VIEWS),
}
