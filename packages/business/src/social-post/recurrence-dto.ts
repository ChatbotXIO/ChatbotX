import type { SocialPostRecurrenceModel } from "@chatbotx.io/database/types"
import { listUpcomingSlots } from "@chatbotx.io/utils/recurrence"
import type {
  SocialPostRecurrenceDto,
  SocialPostRecurrenceState,
} from "./types"

/** Slots shown beside a series: enough to pick a date to skip, cheap to compute. */
export const RECURRENCE_UPCOMING_SLOTS = 10

export const recurrenceStateOf = (
  row: Pick<SocialPostRecurrenceModel, "endedAt" | "pausedAt">,
): SocialPostRecurrenceState => {
  if (row.endedAt) {
    return "ended"
  }
  return row.pausedAt ? "paused" : "active"
}

export const toRecurrenceDto = (
  row: SocialPostRecurrenceModel | null,
  now: Date = new Date(),
): SocialPostRecurrenceDto | null => {
  if (!row) {
    return null
  }
  const state = recurrenceStateOf(row)
  return {
    accountedThroughAt: row.accountedThroughAt,
    endedAt: row.endedAt,
    nextRunAt: row.nextRunAt,
    occurrenceCount: row.occurrenceCount,
    pausedAt: row.pausedAt,
    rule: row.rule,
    state,
    upcoming:
      state === "ended"
        ? []
        : listUpcomingSlots(row.rule, {
            after: now,
            limit: RECURRENCE_UPCOMING_SLOTS,
            occurrenceCount: row.occurrenceCount,
          }),
  }
}
