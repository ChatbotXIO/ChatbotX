import z from "zod"

// The channel rules (which channels, windows, text limit) are data in
// `@chatbotx.io/utils/channel`; re-exported here for the database layer.
export {
  type AiHandoverChannel,
  parseAiHandoverChannel,
} from "@chatbotx.io/utils/channel"

/** Last hour boundary of a day: `{ from: 0, to: 24 }` means "all day". */
export const AI_HANDOVER_DAY_END_HOUR = 24

/**
 * One run-time window in whole hours (0..24) of the workspace timezone,
 * end-exclusive. `from > to` wraps past midnight; `from === to` never matches.
 */
export const aiHandoverTimeRangeSchema = z
  .object({
    from: z.number().int().min(0).max(AI_HANDOVER_DAY_END_HOUR),
    to: z.number().int().min(0).max(AI_HANDOVER_DAY_END_HOUR),
  })
  // Equal bounds describe an empty window; reject it instead of storing a
  // range that can never match.
  .refine((range) => range.from !== range.to)
export type AiHandoverTimeRange = z.infer<typeof aiHandoverTimeRangeSchema>

/** One window per hour at most; more is never meaningful. */
export const AI_HANDOVER_MAX_TIME_RANGES = AI_HANDOVER_DAY_END_HOUR

export const aiHandoverTimeRangesSchema = z
  .array(aiHandoverTimeRangeSchema)
  .max(AI_HANDOVER_MAX_TIME_RANGES)

/** Bulk "apply to all customers" run: what the run does to every eligible thread. */
export const aiHandoverBulkActions = z.enum(["enable", "disable"])
export type AiHandoverBulkAction = z.infer<typeof aiHandoverBulkActions>

/**
 * `pending` (queued, or released for the sweeper) → `running` → a terminal
 * state. `cancelling` is live on purpose: a chunk in flight still settles its
 * batch, so a new run must not start until the worker confirms `cancelled`.
 */
export const aiHandoverBulkStatuses = z.enum([
  "pending",
  "running",
  "cancelling",
  "completed",
  "failed",
  "cancelled",
])
export type AiHandoverBulkStatus = z.infer<typeof aiHandoverBulkStatuses>

/** Statuses during which a run still owns the one-active-run slot. */
export const AI_HANDOVER_BULK_LIVE_STATUSES: AiHandoverBulkStatus[] = [
  "pending",
  "running",
  "cancelling",
]
