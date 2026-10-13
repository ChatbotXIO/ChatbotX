import {
  type BroadcastStatus,
  broadcastStatuses,
  isRecurringTemplate,
} from "@chatbotx.io/database/partials"

/** Order of the left-panel filters (design). */
export const BROADCAST_FILTER_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
] as const
export type BroadcastFilterStatus = (typeof BROADCAST_FILTER_STATUSES)[number]

/** The "Repeating" entry of the left panel; it filters templates, not a status. */
export const BROADCAST_KINDS = ["repeating"] as const
export type BroadcastKind = (typeof BROADCAST_KINDS)[number]

export const BROADCAST_VIEWS = ["table", "calendar"] as const
export type BroadcastView = (typeof BROADCAST_VIEWS)[number]

export const BROADCASTS_PANEL_COOKIE = "broadcasts_panel_state"
export const BROADCASTS_PANEL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * What a row's badge shows. A repeating template reuses the lifecycle
 * statuses `cancelled` and `sent` internally, but to the user they mean
 * "paused" and "ended".
 */
export type BroadcastDisplayState = BroadcastStatus | "paused" | "ended"

export type BroadcastStatusLabelKey =
  `broadcasts.status.${BroadcastDisplayState}`

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

export type BroadcastDisplayStateRow = {
  status: string
  schedulesType: string
  occurrenceAt: Date | null
}

/** The lifecycle statuses a repeating template borrows, as the user reads them. */
const TEMPLATE_DISPLAY_STATE: Partial<
  Record<BroadcastStatus, BroadcastDisplayState>
> = {
  [broadcastStatuses.enum.cancelled]: "paused",
  [broadcastStatuses.enum.sent]: "ended",
}

/** Narrows a row to its badge state; unknown statuses stay `null`. */
export const resolveBroadcastDisplayState = (
  row: BroadcastDisplayStateRow,
): BroadcastDisplayState | null => {
  const status = parseBroadcastStatus(row.status)
  if (status === null || !isRecurringTemplate(row)) {
    return status
  }
  return TEMPLATE_DISPLAY_STATE[status] ?? status
}

type BroadcastStatusConfig = {
  labelKey: BroadcastStatusLabelKey
  dotClassName: string
  badgeClassName: string
}

export const broadcastStatusConfig: Record<
  BroadcastDisplayState,
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
  recurring: {
    labelKey: "broadcasts.status.recurring",
    dotClassName: "bg-violet-500",
    badgeClassName:
      "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  },
  paused: {
    labelKey: "broadcasts.status.paused",
    dotClassName: "bg-amber-500",
    badgeClassName:
      "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  },
  ended: {
    labelKey: "broadcasts.status.ended",
    dotClassName: "bg-zinc-400",
    badgeClassName:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
  cancelled: {
    labelKey: "broadcasts.status.cancelled",
    dotClassName: "bg-zinc-400",
    badgeClassName:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
}
