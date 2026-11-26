import type { CalendarItem } from "./calendar-items"

type ItemStatus = CalendarItem["status"]

/** Chip surface per status; every text colour is a 700 on a 50 (dark: 300 on 950) for contrast. */
export const STATUS_TONES: Record<ItemStatus, string> = {
  cancelled: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  needsReview:
    "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  pending:
    "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  processing: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  published: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  publishing: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
}
