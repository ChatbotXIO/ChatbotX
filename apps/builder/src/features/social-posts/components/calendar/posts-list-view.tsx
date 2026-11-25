"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useFormatter, useTranslations } from "next-intl"
import { parseDateParam, toUtcDay } from "@/components/calendar/calendar-grid"
import type { CalendarItem } from "../../lib/calendar-items"
import {
  POSTS_LIST_FILTERS,
  type PostsListFilter,
} from "../../lib/calendar-view-state"
import type { ListGroups } from "../../lib/list-filter"
import { CountedToggleGroup } from "../counted-toggle-group"

const FILTER_LABEL_KEYS = {
  all: "posts.calendar.list.filters.all",
  drafts: "posts.calendar.list.filters.drafts",
  needsAttention: "posts.calendar.list.filters.needsAttention",
  published: "posts.calendar.list.filters.published",
  scheduled: "posts.calendar.list.filters.scheduled",
} as const satisfies Record<PostsListFilter, string>

const EMPTY_KEYS = {
  all: "posts.calendar.list.empty.all",
  drafts: "posts.calendar.list.empty.drafts",
  needsAttention: "posts.calendar.list.empty.needsAttention",
  published: "posts.calendar.list.empty.published",
  scheduled: "posts.calendar.list.empty.scheduled",
} as const satisfies Record<PostsListFilter, string>

/** How many posts each filter holds; `undefined` while the counts load. */
export type PostsListCounts = Record<PostsListFilter, number> | undefined

/** The state filter of the list: All, Drafts, Scheduled, Published and Needs attention, each with its count. */
export const PostsListStatusFilter = ({
  counts,
  filter,
  onChange,
}: {
  counts: PostsListCounts
  filter: PostsListFilter
  onChange: (filter: PostsListFilter) => void
}) => {
  const t = useTranslations()
  return (
    <CountedToggleGroup
      label={t("posts.calendar.list.filterLabel")}
      onChange={onChange}
      options={POSTS_LIST_FILTERS.map((value) => ({
        count: counts?.[value],
        label: t(FILTER_LABEL_KEYS[value]),
        value,
      }))}
      value={filter}
    />
  )
}

/** The posts of the chosen filter, grouped by day; drafts without a date come first. */
export const PostsListView = ({
  filter,
  groups,
  hasMore,
  isLoadingMore,
  onLoadMore,
  renderRow,
}: {
  filter: PostsListFilter
  groups: ListGroups
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  renderRow: (item: CalendarItem) => React.ReactNode
}) => {
  const t = useTranslations()
  const formatter = useFormatter()

  if (groups.noDate.length === 0 && groups.days.length === 0) {
    return (
      <p className="rounded-lg border p-6 text-center text-muted-foreground text-sm">
        {t(EMPTY_KEYS[filter])}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.noDate.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium text-sm">{t("posts.calendar.noDate")}</h3>
          <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
            {groups.noDate.map(renderRow)}
          </div>
        </section>
      ) : null}
      {groups.days.map((group) => (
        <section className="flex flex-col gap-1.5" key={group.key}>
          <h3 className="font-medium text-sm">
            {formatter.dateTime(toUtcDay(parseDateParam(group.key)), {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
              weekday: "short",
              year: "numeric",
            })}
          </h3>
          <div className="flex flex-col divide-y overflow-hidden rounded-lg border">
            {group.items.map(renderRow)}
          </div>
        </section>
      ))}
      {hasMore ? (
        <Button
          className="self-center"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          variant="outline"
        >
          {t("posts.calendar.list.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
