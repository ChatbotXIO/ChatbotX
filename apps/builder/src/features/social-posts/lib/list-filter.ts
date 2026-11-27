import type { SocialPostBucket } from "@chatbotx.io/utils/social-post"
import { groupByDay, sortByDate } from "@/components/calendar/calendar-grid"
import type { CalendarItem, DatedCalendarItem } from "./calendar-items"
import type { PostsListFilter } from "./calendar-view-state"

export type ListWindow = { from: Date; to: Date }

/** What the list asks the server for: a bucket, a time range, or neither. */
export type ListQuerySpec = {
  bucket: SocialPostBucket | undefined
  /** Drafts and needs-attention ignore the visible range: they are every such post, paged. */
  window: ListWindow | undefined
}

/**
 * The query a state filter stands for in a view. The grids (month, week, day)
 * always follow the visible range, narrowed to the bucket. The list does too
 * for All, Scheduled and Published; Drafts and Needs attention are not about a
 * date, so the list shows every such post (paged with the cursor).
 */
export const listQueryFor = (
  filter: PostsListFilter,
  period: ListWindow,
  isList = true,
): ListQuerySpec => {
  switch (filter) {
    case "all":
      return { bucket: undefined, window: period }
    case "scheduled":
    case "published":
      return { bucket: filter, window: period }
    case "drafts":
    case "needsAttention":
      return { bucket: filter, window: isList ? undefined : period }
    default: {
      const exhaustive: never = filter
      return exhaustive
    }
  }
}

/** Whether the filter lists drafts that have no date (they form the "No date" group). */
export const showsUndatedDrafts = (filter: PostsListFilter): boolean =>
  filter === "all" || filter === "drafts"

export type ListDayGroup = { items: DatedCalendarItem[]; key: string }

export type ListGroups = {
  days: ListDayGroup[]
  /** Drafts without a date; shown first. */
  noDate: CalendarItem[]
}

/**
 * The list's groups: "No date" first, then one group per day in `timezone`.
 * Days run oldest first inside a range; a list of every post of a bucket runs
 * newest first, as its pages arrive.
 */
export const groupListItems = ({
  dated,
  newestFirst,
  timezone,
  undated,
}: {
  dated: DatedCalendarItem[]
  newestFirst: boolean
  timezone: string
  undated: CalendarItem[]
}): ListGroups => {
  const byDay = groupByDay(dated, (item) => item.at, timezone)
  const keys = [...byDay.keys()].sort()
  if (newestFirst) {
    keys.reverse()
  }
  return {
    days: keys.map((key) => {
      const rows = sortByDate(byDay.get(key) ?? [], (item) => item.at)
      return { items: newestFirst ? [...rows].reverse() : rows, key }
    }),
    noDate: undated,
  }
}

/** The posts page address for a state, as the "View" action of a save toast opens it. */
export const postsListUrl = (
  workspaceId: string,
  filter: PostsListFilter,
): string => `/space/${workspaceId}/posts/calendar?view=list&status=${filter}`

/** How a composer save ended: kept as a draft, published at once, or scheduled. */
export type SubmitOutcome = "draft" | "now" | "scheduled"

/** The list filter the "View" action of a save toast opens; publishing now has none. */
export const viewFilterAfterSave = (
  outcome: SubmitOutcome,
): PostsListFilter | undefined => {
  switch (outcome) {
    case "draft":
      return "drafts"
    case "scheduled":
      return "scheduled"
    case "now":
      return
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}
