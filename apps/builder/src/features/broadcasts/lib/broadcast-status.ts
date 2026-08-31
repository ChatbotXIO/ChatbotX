import {
  type BroadcastStatus,
  broadcastStatuses,
} from "@chatbotx.io/database/partials"

/** Order of the left-panel filters (design). `cancelled` intentionally has no filter. */
export const BROADCAST_FILTER_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
] as const
export type BroadcastFilterStatus = (typeof BROADCAST_FILTER_STATUSES)[number]

export const BROADCAST_VIEWS = ["table", "calendar"] as const
export type BroadcastView = (typeof BROADCAST_VIEWS)[number]

export const BROADCASTS_PANEL_COOKIE = "broadcasts_panel_state"
export const BROADCASTS_PANEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type BroadcastStatusLabelKey = `broadcasts.status.${BroadcastStatus}`

/**
 * Single place that narrows a raw DB `string` (the `Broadcast.status` column
 * type is widened to `string` by the generated model) down to a
 * `BroadcastStatus`. Every consumer of `broadcast.status` — badge, table,
 * calendar — should go through this instead of re-parsing inline.
 */
export const parseBroadcastStatus = (value: string): BroadcastStatus | null => {
  const parsed = broadcastStatuses.safeParse(value)
  return parsed.success ? parsed.data : null
}

type BroadcastStatusConfig = {
  labelKey: BroadcastStatusLabelKey
  dotClassName: string
  badgeClassName: string
}

export const broadcastStatusConfig: Record<
  BroadcastStatus,
  BroadcastStatusConfig
> = {
  draft: {
    labelKey: "broadcasts.status.draft",
    dotClassName: "bg-zinc-500",
    badgeClassName:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  },
  scheduled: {
    labelKey: "broadcasts.status.scheduled",
    dotClassName: "bg-orange-500",
    badgeClassName:
      "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  sending: {
    labelKey: "broadcasts.status.sending",
    dotClassName: "bg-green-400",
    badgeClassName:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  },
  sent: {
    labelKey: "broadcasts.status.sent",
    dotClassName: "bg-green-600",
    badgeClassName:
      "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  },
  failed: {
    labelKey: "broadcasts.status.failed",
    dotClassName: "bg-red-500",
    badgeClassName: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
  cancelled: {
    labelKey: "broadcasts.status.cancelled",
    dotClassName: "bg-zinc-400",
    badgeClassName:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
}
