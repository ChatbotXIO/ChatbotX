"use client"

import type { SocialProvider } from "@chatbotx.io/database/partials"
import { Alert, AlertDescription } from "@chatbotx.io/ui/components/ui/alert"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useIsMobileState } from "@chatbotx.io/ui/hooks/use-mobile"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { format } from "date-fns"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  calendarRangeConfig,
  DATE_PARAM_FORMAT,
  dayKey,
  formatUtcDayRange,
  getCalendarQueryRange,
  groupByDay,
  parseDateParam,
  resolveDateParam,
  sortByDate,
  toUtcDay,
} from "@/components/calendar/calendar-grid"
import { CalendarGrid } from "@/components/calendar/calendar-grid-view"
import {
  useDraftPosts,
  usePostCounts,
  usePostsQuery,
} from "../../hooks/use-calendar-posts"
import { useDestinationOptions } from "../../hooks/use-destination-options"
import { useFreeSlots } from "../../hooks/use-free-slots"
import { useReschedule } from "../../hooks/use-reschedule"
import { mergeSlots, slotDestinationIds } from "../../lib/calendar-free-slots"
import {
  buildDatedItems,
  buildUndatedItems,
  type CalendarItem,
  type DatedCalendarItem,
  datedOnly,
  isDayDroppable,
  itemsInRange,
  resolveDropInstant,
} from "../../lib/calendar-items"
import {
  calendarSearchParsers,
  type PostsCalendarView,
  VIEW_RANGE,
} from "../../lib/calendar-view-state"
import {
  groupListItems,
  type ListQuerySpec,
  listQueryFor,
  showsUndatedDrafts,
} from "../../lib/list-filter"
import { CalendarChip, itemKey } from "./calendar-chip"
import {
  CalendarDropCell,
  dayFromDropId,
  NO_DATE_DROP_ID,
} from "./calendar-drop-cell"
import { CalendarItemDialog } from "./calendar-item-dialog"
import { CalendarToolbar } from "./calendar-toolbar"
import { FreeSlotMarkers } from "./free-slot-markers"
import { PostsListStatusFilter, PostsListView } from "./posts-list-view"

/** Before the viewport is measured there is no default yet; a phone starts on the list. */
const defaultView = (
  isMobile: boolean | undefined,
): PostsCalendarView | null => {
  if (isMobile === undefined) {
    return null
  }
  return isMobile ? "list" : "month"
}

const FREE_SLOT_LIMIT = 50
const SKELETON_HEIGHT = "h-96"
const TOUCH_DRAG_DELAY_MS = 250
const TOUCH_DRAG_TOLERANCE_PX = 5
const POINTER_DRAG_DISTANCE_PX = 6

const NoDatePanel = ({
  children,
  droppable,
}: {
  children: React.ReactNode
  droppable: boolean
}) => {
  const t = useTranslations()
  const { isOver, setNodeRef } = useDroppable({
    disabled: !droppable,
    id: NO_DATE_DROP_ID,
  })
  return (
    <section
      aria-labelledby="calendar-no-date"
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3",
        isOver && "bg-primary/10 ring-2 ring-primary",
      )}
      ref={setNodeRef}
    >
      <h3 className="font-semibold text-sm" id="calendar-no-date">
        {t("posts.calendar.noDate")}
      </h3>
      {children}
    </section>
  )
}

type RenderRow = (item: CalendarItem) => React.ReactNode

/** One day's posts as rows, in time order. */
const DayList = ({
  items,
  renderItem,
}: {
  items: DatedCalendarItem[]
  renderItem: RenderRow
}) => {
  const t = useTranslations()
  const rows = sortByDate(items, (item) => item.at)
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-muted-foreground text-sm">
        {t("posts.calendar.emptyDay")}
      </p>
    )
  }
  return rows.map(renderItem)
}

/** The posts calendar: month, week, day and list views over the posts' destinations, with drag to reschedule. */
export const PostsCalendar = ({
  readOnly,
  timezone,
  workspaceId,
}: {
  readOnly: boolean
  timezone: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const isMobile = useIsMobileState()
  const [query, setQuery] = useQueryStates(calendarSearchParsers)
  const [selected, setSelected] = useState<CalendarItem | null>(null)
  const { reschedule } = useReschedule(workspaceId, timezone)
  // Moving to a time needs an active plan; taking a post back to drafts does not.
  const canReschedule = !readOnly
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: POINTER_DRAG_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_DRAG_DELAY_MS,
        tolerance: TOUCH_DRAG_TOLERANCE_PX,
      },
    }),
  )

  const view = query.view ?? defaultView(isMobile)
  const filters = { destinationId: query.destination, provider: query.provider }
  const anchor = useMemo(
    () => parseDateParam(query.date ?? resolveDateParam(null, timezone)),
    [query.date, timezone],
  )
  const range = VIEW_RANGE[view ?? "month"]
  const period = useMemo(
    () => getCalendarQueryRange(range, anchor, anchor, timezone),
    [range, anchor, timezone],
  )
  const isList = view === "list"
  const listFilter = query.status ?? "all"
  // Every view follows the state filter; only the list drops the range for Drafts and Needs attention.
  const spec: ListQuerySpec = useMemo(
    () => listQueryFor(listFilter, period, isList),
    [isList, listFilter, period],
  )

  const destinationOptions = useDestinationOptions(workspaceId)
  const periodPosts = usePostsQuery(workspaceId, filters, spec)
  // The undated drafts (grid side column, list "No date" group of All) only belong to All and Drafts.
  const needsDraftQuery =
    showsUndatedDrafts(listFilter) && !(isList && listFilter === "drafts")
  const draftPosts = useDraftPosts(workspaceId, filters, needsDraftQuery)
  // Free posting times of the picked destination(s), marked in the week and day views.
  const showsFreeSlots = !readOnly && (view === "week" || view === "day")
  const freeSlots = useFreeSlots({
    after: period.from,
    destinationIds: slotDestinationIds(destinationOptions, {
      destinationId: query.destination,
      provider: query.provider,
    }),
    enabled: showsFreeSlots,
    limit: FREE_SLOT_LIMIT,
    until: period.to,
    workspaceId,
  })
  const hasMoreFreeSlots =
    showsFreeSlots && freeSlots.some((slot) => slot.isTruncated)
  const freeSlotsByDay = useMemo(
    () =>
      groupByDay(
        mergeSlots(freeSlots.map((slot) => slot.items)).filter(
          (slot) => slot < period.to,
        ),
        (slot) => slot,
        timezone,
      ),
    [freeSlots, period.to, timezone],
  )
  const hasNoDatePanel = !isList && showsUndatedDrafts(listFilter)
  const counts = usePostCounts(workspaceId, filters, true)

  const items = useMemo(() => {
    const dated = buildDatedItems(periodPosts.posts)
    return spec.window
      ? itemsInRange(dated, spec.window.from, spec.window.to)
      : datedOnly(dated)
  }, [periodPosts.posts, spec.window])
  const undated = useMemo(
    () => buildUndatedItems(needsDraftQuery ? draftPosts.posts : []),
    [draftPosts.posts, needsDraftQuery],
  )
  // The Drafts list pages every draft, so its undated ones come from the same pages.
  const listUndated = useMemo(() => {
    if (!showsUndatedDrafts(listFilter)) {
      return []
    }
    return listFilter === "drafts"
      ? buildUndatedItems(periodPosts.posts)
      : undated
  }, [listFilter, periodPosts.posts, undated])
  const listGroups = useMemo(
    () =>
      groupListItems({
        dated: items,
        newestFirst: spec.window === undefined,
        timezone,
        undated: listUndated,
      }),
    [items, listUndated, spec.window, timezone],
  )

  const itemsByKey = useMemo(
    () =>
      new Map(
        [...items, ...undated, ...listUndated].map((item) => [
          itemKey(item),
          item,
        ]),
      ),
    [items, undated, listUndated],
  )

  const step = (direction: 1 | -1) =>
    setQuery({
      date: format(
        calendarRangeConfig[range].step(anchor, anchor, direction).date,
        DATE_PARAM_FORMAT,
      ),
    })

  const title = (() => {
    if (range === "week") {
      const { from, to } = calendarRangeConfig.week.getVisibleInterval(
        anchor,
        anchor,
      )
      return formatUtcDayRange(from, to, (day) =>
        formatter.dateTime(day, {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
          year: "numeric",
        }),
      )
    }
    return formatter.dateTime(toUtcDay(anchor), {
      timeZone: "UTC",
      ...(range === "day"
        ? { day: "numeric", month: "long", weekday: "long", year: "numeric" }
        : { month: "long", year: "numeric" }),
    })
  })()

  const composeHref = (dayKeyValue: string): string | null => {
    const now = new Date()
    if (readOnly || !isDayDroppable(dayKeyValue, timezone, now)) {
      return null
    }
    const at = resolveDropInstant({
      dayKeyValue,
      now,
      original: null,
      timezone,
    })
    return `/space/${workspaceId}/posts/create?at=${encodeURIComponent(at.toISOString())}`
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const item = itemsByKey.get(String(active.id))
    if (!(item && over)) {
      return
    }
    const target = String(over.id)
    if (target === NO_DATE_DROP_ID) {
      if (item.canUnschedule) {
        reschedule({
          kind: "unschedule",
          postId: item.postId,
          targetId: null,
        })
      } else if (item.at) {
        toast.error(t("posts.calendar.errors.cannotUnschedule"))
      }
      return
    }
    const dropDay = dayFromDropId(target)
    const now = new Date()
    if (!(dropDay && isDayDroppable(dropDay, timezone, now))) {
      return
    }
    const at = resolveDropInstant({
      dayKeyValue: dropDay,
      now,
      original: item.at,
      timezone,
    })
    reschedule({
      at,
      kind: "schedule",
      postId: item.postId,
      targetId: item.targetId,
    })
  }

  const renderItem = (
    item: CalendarItem,
    options: { showTime: boolean },
    variant: "chip" | "row" = "chip",
  ) => (
    <CalendarChip
      dragEnabled={(canReschedule || item.canUnschedule) && !isList}
      item={item}
      key={itemKey(item)}
      onOpen={setSelected}
      showTime={options.showTime}
      timezone={timezone}
      variant={variant}
    />
  )

  const renderRow = (item: CalendarItem) =>
    renderItem(item, { showTime: true }, "row")

  const renderDayCell = (cell: {
    children: React.ReactNode
    className: string
    day: Date
    key: string
  }) => (
    <CalendarDropCell
      className={cell.className}
      composeHref={composeHref(cell.key)}
      day={cell.day}
      dayKeyValue={cell.key}
      droppable={
        canReschedule && isDayDroppable(cell.key, timezone, new Date())
      }
      key={cell.key}
    >
      {cell.children}
      {showsFreeSlots ? (
        <FreeSlotMarkers
          slots={freeSlotsByDay.get(cell.key) ?? []}
          timezone={timezone}
          workspaceId={workspaceId}
        />
      ) : null}
    </CalendarDropCell>
  )

  const renderBody = (activeView: PostsCalendarView) => {
    if (periodPosts.isError) {
      return (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-3">
            {t("posts.calendar.loadError")}
            <Button
              onClick={() => periodPosts.refetch()}
              size="sm"
              variant="outline"
            >
              {t("posts.calendar.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      )
    }
    if (periodPosts.isLoading) {
      return <Skeleton className={cn("w-full rounded-lg", SKELETON_HEIGHT)} />
    }
    if (activeView === "month" || activeView === "week") {
      return (
        <CalendarGrid
          anchor={anchor}
          getDate={(item: DatedCalendarItem) => item.at}
          getKey={itemKey}
          items={items}
          renderDayCell={renderDayCell}
          renderItem={renderItem}
          renderOverflow={(count) => (
            <span className="px-1 text-muted-foreground text-xs">
              {t("posts.calendar.more", { count })}
            </span>
          )}
          timezone={timezone}
          view={activeView}
        />
      )
    }
    if (activeView === "list") {
      return (
        <PostsListView
          filter={listFilter}
          groups={listGroups}
          hasMore={periodPosts.hasMore}
          isLoadingMore={periodPosts.isLoadingMore}
          onLoadMore={periodPosts.loadMore}
          renderRow={renderRow}
        />
      )
    }
    const key = dayKey(anchor)
    const byDay = groupByDay(items, (item) => item.at, timezone)
    return renderDayCell({
      children: <DayList items={byDay.get(key) ?? []} renderItem={renderRow} />,
      className: "flex min-h-48 flex-col divide-y rounded-lg border",
      day: anchor,
      key,
    })
  }

  if (view === null) {
    return <Skeleton className={cn("w-full rounded-lg", SKELETON_HEIGHT)} />
  }

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        destinationId={query.destination}
        destinations={destinationOptions}
        onDestinationChange={(destination) => setQuery({ destination })}
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onProviderChange={(provider: SocialProvider | null) =>
          setQuery({ destination: null, provider })
        }
        onToday={() => setQuery({ date: null })}
        onViewChange={(next) => setQuery({ view: next })}
        periodHidden={isList && spec.window === undefined}
        provider={query.provider}
        title={title}
        view={view}
      />
      <PostsListStatusFilter
        counts={counts.data}
        filter={listFilter}
        onChange={(status) => setQuery({ status })}
      />
      {readOnly ? (
        <Alert>
          <AlertDescription>{t("posts.calendar.readOnly")}</AlertDescription>
        </Alert>
      ) : null}
      {periodPosts.isLoadMoreError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {t("messages.errorLoadingData")}{" "}
            <button
              className="underline"
              onClick={periodPosts.loadMore}
              type="button"
            >
              {t("actions.retry")}
            </button>
          </AlertDescription>
        </Alert>
      ) : null}
      {periodPosts.isTruncated && !periodPosts.isLoadMoreError ? (
        <Alert>
          <AlertDescription>{t("posts.calendar.truncated")}</AlertDescription>
        </Alert>
      ) : null}
      {hasMoreFreeSlots ? (
        <Alert>
          <AlertDescription>
            {t("posts.calendar.freeSlots.truncated")}
          </AlertDescription>
        </Alert>
      ) : null}
      <DndContext onDragEnd={onDragEnd} sensors={sensors}>
        <div
          className={cn(
            "flex flex-col gap-4",
            hasNoDatePanel && "lg:grid lg:grid-cols-[minmax(0,1fr)_16rem]",
          )}
        >
          <div className="min-w-0">{renderBody(view)}</div>
          {hasNoDatePanel ? (
            <NoDatePanel droppable>
              <div className="flex flex-col gap-1">
                {undated.map((item) => renderItem(item, { showTime: false }))}
                {undated.length === 0 && !draftPosts.hasMore ? (
                  <p className="text-muted-foreground text-xs">
                    {draftPosts.isLoading
                      ? t("posts.calendar.loading")
                      : t("posts.calendar.noDateEmpty")}
                  </p>
                ) : null}
                {/* The loaded pages may hold only dated drafts: more can still hold undated ones. */}
                {draftPosts.hasMore ? (
                  <Button
                    disabled={draftPosts.isLoadingMore}
                    onClick={draftPosts.loadMore}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {t("posts.calendar.list.loadMore")}
                  </Button>
                ) : null}
              </div>
            </NoDatePanel>
          ) : null}
        </div>
      </DndContext>
      {!(readOnly || isList || periodPosts.isLoading) && items.length === 0 ? (
        <p className="text-center text-muted-foreground text-sm">
          {t("posts.calendar.emptyHint")}{" "}
          <Link
            className={buttonVariants({ size: "sm", variant: "link" })}
            href={`/space/${workspaceId}/posts/create`}
          >
            {t("composer.newPost")}
          </Link>
        </p>
      ) : null}
      <CalendarItemDialog
        canReschedule={canReschedule}
        item={selected}
        onClose={() => setSelected(null)}
        onReschedule={reschedule}
        timezone={timezone}
        workspaceId={workspaceId}
      />
    </div>
  )
}
