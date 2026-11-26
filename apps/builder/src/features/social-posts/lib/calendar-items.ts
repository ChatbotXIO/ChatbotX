import type { SocialProvider } from "@chatbotx.io/database/partials"
import {
  zonedDayKey,
  zonedDayTimeToInstant,
  zonedTimeOfDay,
} from "@/components/calendar/calendar-grid"
import type { ComposerPost } from "./composer-state"

type PostTarget = ComposerPost["targets"][number]
type CalendarTargetStatus = PostTarget["status"]

/** What a chip stands for: a destination's slot in time, or a draft that has none yet. */
export type CalendarItem = {
  destinationName: string
  /** When it is, or was, published. `null` for an undated draft. */
  at: Date | null
  /** A scheduled post can go back to drafts as a whole. */
  canUnschedule: boolean
  isMovable: boolean
  permalink: string | null
  postId: string
  provider: SocialProvider
  /** `draft` for an undated post, else the destination's own status. */
  status: CalendarTargetStatus | "draft"
  targetId: string | null
  text: string | null
}

export type DatedCalendarItem = CalendarItem & { at: Date }

const isDated = (item: CalendarItem): item is DatedCalendarItem =>
  item.at !== null

/** Statuses of a destination whose time can still be changed. */
const MOVABLE_TARGET_STATUSES: readonly CalendarTargetStatus[] = ["pending"]

/** Where an undated draft lands when dropped on a day, unless the drop day is today. */
export const DEFAULT_DRAFT_TIME = "09:00:00.000"
/** The least lead the server accepts for a scheduled time (docs/posts.md: at least 2 minutes ahead). */
export const MIN_SCHEDULE_LEAD_MS = 2 * 60 * 1000

const toItem = (post: ComposerPost, target: PostTarget): CalendarItem => {
  const at = target.publishedAt ?? target.scheduledAt
  return {
    destinationName: target.destination.name,
    at,
    canUnschedule: post.status === "scheduled",
    isMovable: at !== null && MOVABLE_TARGET_STATUSES.includes(target.status),
    permalink: target.permalink,
    postId: post.id,
    provider: target.provider,
    status: target.status,
    targetId: target.id,
    text: target.textOverride ?? post.text,
  }
}

/** The time a draft is planned for: its earliest destination time, or `null` when none was planned. */
export const plannedAtOf = (post: ComposerPost): Date | null => {
  const times = post.targets.flatMap((target) =>
    target.scheduledAt ? [target.scheduledAt.getTime()] : [],
  )
  return times.length > 0 ? new Date(Math.min(...times)) : null
}

/**
 * One chip per draft post: a draft's destinations travel together. A draft that
 * was planned for a time sits on that day (`at`) and, being a draft, is not
 * dragged (a drop would schedule it; the item dialog does that on purpose).
 */
const toDraftItem = (post: ComposerPost): CalendarItem | null => {
  const [first] = post.targets
  if (!first) {
    return null
  }
  const at = plannedAtOf(post)
  return {
    destinationName: post.targets.map((t) => t.destination.name).join(", "),
    at,
    canUnschedule: false,
    isMovable: at === null,
    permalink: null,
    postId: post.id,
    provider: first.provider,
    status: "draft",
    targetId: null,
    text: post.text,
  }
}

const isDraftPost = (post: ComposerPost): boolean => post.status === "draft"

/**
 * The chips that have a time: one per dated, not cancelled destination, and one
 * per draft that was planned for a time. Anything without a time is left to
 * `buildUndatedItems`.
 */
export const buildDatedItems = (posts: ComposerPost[]): CalendarItem[] =>
  posts.flatMap((post) => {
    if (isDraftPost(post)) {
      const item = toDraftItem(post)
      return item?.at ? [item] : []
    }
    return post.targets
      .filter(
        (target) =>
          target.status !== "cancelled" &&
          (target.publishedAt ?? target.scheduledAt) !== null,
      )
      .map((target) => toItem(post, target))
  })

/** One chip per draft post that was never given a time. */
export const buildUndatedItems = (posts: ComposerPost[]): CalendarItem[] =>
  posts.filter(isDraftPost).flatMap((post) => {
    const item = toDraftItem(post)
    return item && item.at === null ? [item] : []
  })

/** Keeps the items that have a time. */
export const datedOnly = (items: CalendarItem[]): DatedCalendarItem[] =>
  items.filter(isDated)

/** Keeps the items whose time falls inside `[from, to]`. */
export const itemsInRange = (
  items: CalendarItem[],
  from: Date,
  to: Date,
): DatedCalendarItem[] =>
  items
    .filter(isDated)
    .filter(
      (item) =>
        item.at.getTime() >= from.getTime() &&
        item.at.getTime() <= to.getTime(),
    )

/** Whether a whole calendar day can still receive a post: today and later, in `timezone`. */
export const isDayDroppable = (
  dayKeyValue: string,
  timezone: string,
  now: Date,
): boolean => dayKeyValue >= zonedDayKey(now, timezone)

/**
 * The instant a post dropped on `dayKeyValue` is scheduled for: it keeps its
 * time of day (an undated draft gets `DEFAULT_DRAFT_TIME`). On today a time
 * that already passed, or is too close, moves to "now" plus the minimum lead.
 */
export const resolveDropInstant = ({
  dayKeyValue,
  original,
  now,
  timezone,
}: {
  dayKeyValue: string
  now: Date
  original: Date | null
  timezone: string
}): Date => {
  const timeOfDay = original
    ? zonedTimeOfDay(original, timezone)
    : DEFAULT_DRAFT_TIME
  const candidate = zonedDayTimeToInstant(dayKeyValue, timeOfDay, timezone)
  const earliest = now.getTime() + MIN_SCHEDULE_LEAD_MS
  return candidate.getTime() >= earliest ? candidate : new Date(earliest)
}

export type RescheduleChange = {
  postId: string
  /** `null` moves the whole post (a draft). */
  targetId: string | null
} & ({ at: Date; kind: "schedule" } | { kind: "unschedule" })

/** The posts as they look once `change` went through — the optimistic view shown while the server works. */
export const applyReschedule = (
  posts: ComposerPost[],
  change: RescheduleChange,
): ComposerPost[] =>
  posts.map((post) => {
    if (post.id !== change.postId) {
      return post
    }
    const touches = (target: PostTarget): boolean =>
      change.targetId === null || target.id === change.targetId
    const scheduledAt = change.kind === "schedule" ? change.at : null
    const targets = post.targets.map((target) =>
      touches(target)
        ? {
            ...target,
            queueSlotAt: null,
            scheduleMode: "custom" as const,
            scheduledAt,
            status: "pending" as const,
          }
        : target,
    )
    let { status } = post
    if (change.targetId === null) {
      status = change.kind === "schedule" ? "scheduled" : "draft"
    }
    return { ...post, status, targets }
  })
