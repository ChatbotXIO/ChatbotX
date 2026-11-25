import { z } from "zod"

/** A post of the sample: when it went out and how much engagement it collected. */
export type BestTimesPost = {
  engagement: number
  inboxId: string
  publishedAt: Date
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const bestTimeSlot = z.object({
  hour: z.number().int().min(0).max(23),
  /** Number of posts in the slot. */
  sampleSize: z.number().int().min(1),
  /** Median engagement of the slot's posts relative to their inbox's median (1 = typical). */
  score: z.number(),
  weekday: z.number().int().min(1).max(7),
})
export type BestTimeSlot = z.infer<typeof bestTimeSlot>

export const bestTimesStatuses = z.enum(["ok", "insufficientData"])
export type BestTimesStatus = z.infer<typeof bestTimesStatuses>

/** Posts a slot needs before it is ranked. */
export const BEST_TIMES_MIN_PER_SLOT = 3
/** Posts the whole sample needs before any slot is ranked. */
export const BEST_TIMES_MIN_TOTAL = 20
/** Slots in the ranking. */
export const BEST_TIMES_TOP_COUNT = 5

export type BestTimesResult = {
  /** Every slot that has at least one post (the heatmap); `score` of a thin slot is still shown. */
  slots: BestTimeSlot[]
  status: BestTimesStatus
  timezone: string
  /** The best slots, strongest first; empty unless `status` is `ok`. */
  top: BestTimeSlot[]
  totalPosts: number
}

const WEEKDAYS: Record<string, number> = {
  Fri: 5,
  Mon: 1,
  Sat: 6,
  Sun: 7,
  Thu: 4,
  Tue: 2,
  Wed: 3,
}

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

const localSlot = (
  formatter: Intl.DateTimeFormat,
  at: Date,
): { hour: number; weekday: number } | null => {
  const parts = formatter.formatToParts(at)
  const weekday =
    WEEKDAYS[parts.find((part) => part.type === "weekday")?.value ?? ""]
  const hour = Number(parts.find((part) => part.type === "hour")?.value)
  return weekday !== undefined && Number.isInteger(hour)
    ? { hour: hour % 24, weekday }
    : null
}

/**
 * Best posting times: the weekday x hour slots (in `timezone`) whose posts
 * collected the most engagement relative to their own inbox. Each post's value
 * is its engagement over the median of its inbox's posts, so a big page does
 * not drown a small one; a slot's score is the median of its posts' values.
 * A slot needs `BEST_TIMES_MIN_PER_SLOT` posts and the sample
 * `BEST_TIMES_MIN_TOTAL`, otherwise no ranking is given (`insufficientData`).
 */
export function computeBestTimes(input: {
  posts: BestTimesPost[]
  timezone: string
}): BestTimesResult {
  const { posts, timezone } = input
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
    weekday: "short",
  })

  const byInbox = new Map<string, number[]>()
  for (const post of posts) {
    byInbox.set(post.inboxId, [
      ...(byInbox.get(post.inboxId) ?? []),
      post.engagement,
    ])
  }
  const inboxMedian = new Map(
    [...byInbox].map(([inboxId, values]) => [inboxId, median(values)]),
  )

  const buckets = new Map<string, number[]>()
  for (const post of posts) {
    const slot = localSlot(formatter, post.publishedAt)
    if (!slot) {
      continue
    }
    // A median of 0 (most posts without engagement) would divide by zero: 1 is
    // the smallest unit that still ranks a busy slot above a quiet one.
    const base = Math.max(inboxMedian.get(post.inboxId) ?? 0, 1)
    const key = `${slot.weekday}:${slot.hour}`
    buckets.set(key, [...(buckets.get(key) ?? []), post.engagement / base])
  }

  const slots: BestTimeSlot[] = [...buckets].map(([key, values]) => {
    const [weekday, hour] = key.split(":").map(Number)
    return {
      hour: hour ?? 0,
      sampleSize: values.length,
      score: Math.round(median(values) * 1000) / 1000,
      weekday: weekday ?? 1,
    }
  })
  slots.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour)

  const total = slots.reduce((sum, slot) => sum + slot.sampleSize, 0)
  const status: BestTimesStatus =
    total >= BEST_TIMES_MIN_TOTAL ? "ok" : "insufficientData"
  const top =
    status === "ok"
      ? slots
          .filter((slot) => slot.sampleSize >= BEST_TIMES_MIN_PER_SLOT)
          .sort(
            (a, b) =>
              b.score - a.score ||
              b.sampleSize - a.sampleSize ||
              a.weekday - b.weekday ||
              a.hour - b.hour,
          )
          .slice(0, BEST_TIMES_TOP_COUNT)
      : []
  return { slots, status, timezone, top, totalPosts: total }
}
