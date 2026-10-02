import {
  AI_HANDOVER_BULK_LIVE_STATUSES,
  type AiHandoverBulkStatus,
} from "@chatbotx.io/database/partials"
import type { AiHandoverBulkRunModel } from "@chatbotx.io/database/types"
import type {
  AiHandoverBulkRunResource,
  GetApplyToAllStatusResponse,
} from "../schema/bulk"

/** A live run parked until a future time waits out the Page's quota. */
const pausedUntilOf = (run: AiHandoverBulkRunModel, now: Date): Date | null =>
  AI_HANDOVER_BULK_LIVE_STATUSES.includes(run.status) &&
  run.pausedUntil !== null &&
  run.pausedUntil > now
    ? run.pausedUntil
    : null

export const toBulkRunResource = (
  run: AiHandoverBulkRunModel,
  requestedBy?: { name: string | null; email: string } | null,
  now: Date = new Date(),
): AiHandoverBulkRunResource => ({
  id: run.id,
  action: run.action,
  status: run.status,
  message: run.message,
  requestedAt: run.requestedAt,
  startedAt: run.startedAt,
  finishedAt: run.finishedAt,
  processedCount: run.processedCount,
  skippedCount: run.skippedCount,
  failedCount: run.failedCount,
  totalCount: run.totalCount,
  currentError: run.currentError,
  requestedByName: requestedBy ? (requestedBy.name ?? requestedBy.email) : null,
  pausedUntil: pausedUntilOf(run, now),
})

/**
 * The Page's switch and the run serving its latest revision. A stored change
 * whose run does not exist yet is `reconciling`; a Page never switched is `idle`.
 */
export const toApplyToAllStatus = (
  state: {
    applyToAllCustomers: boolean
    revision: number
    run: AiHandoverBulkRunModel | null
  },
  isAutomationActive: boolean,
  now: Date = new Date(),
): GetApplyToAllStatusResponse => {
  let status: GetApplyToAllStatusResponse["status"] = "idle"
  if (state.run) {
    status = state.run.status
  } else if (state.revision > 0) {
    status = "reconciling"
  }
  return {
    status,
    applyToAllCustomers: state.applyToAllCustomers,
    isAutomationActive,
    run: state.run ? toBulkRunResource(state.run, null, now) : null,
  }
}

type BulkStatusTone = "muted" | "info" | "success" | "warning" | "destructive"

/**
 * One entry per status (a table, never an if/else chain): the i18n key and the
 * tone. `satisfies Record<...>` turns a status added to the enum into a compile
 * error here instead of a silent fallthrough.
 */
export const bulkStatusCopy = {
  pending: { key: "aiHandover.bulk.status.pending", tone: "muted" },
  running: { key: "aiHandover.bulk.status.running", tone: "info" },
  cancelling: { key: "aiHandover.bulk.status.cancelling", tone: "warning" },
  completed: { key: "aiHandover.bulk.status.completed", tone: "success" },
  failed: { key: "aiHandover.bulk.status.failed", tone: "destructive" },
  cancelled: { key: "aiHandover.bulk.status.cancelled", tone: "warning" },
} satisfies Record<AiHandoverBulkStatus, { key: string; tone: BulkStatusTone }>

export const bulkToneClassName = {
  muted: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  success:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  destructive: "bg-destructive/10 text-destructive",
} satisfies Record<BulkStatusTone, string>

const POLL_INTERVAL_MS = 5000
/** A stored change normally gets its run within seconds. */
const FAST_RECONCILING_MS = 60_000
const SLOW_POLL_INTERVAL_MS = 30_000
/** While the automation does not run: a schedule window may open any minute. */
const INACTIVE_POLL_INTERVAL_MS = 60_000

type StatusQueryState = {
  state: {
    data?: Pick<GetApplyToAllStatusResponse, "status" | "isAutomationActive">
  }
}

/**
 * `refetchInterval` of the status query: polls while a run is live, and while a
 * stored change waits for its run (`reconcilingForMs`: how long it has been
 * `reconciling`): every few seconds at first, then slowly. It may wait a long
 * time (an opposite run winding down, or an ON until the schedule opens), so it
 * never gives up: the card must show the run when it appears. Once settled it
 * only checks now and then whether the automation started running (its
 * schedule window opened), which unlocks the switch.
 */
export const applyToAllPollInterval = (
  query: StatusQueryState,
  reconcilingForMs: number,
): number | false => {
  const status = query.state.data?.status
  if (
    status &&
    AI_HANDOVER_BULK_LIVE_STATUSES.includes(status as AiHandoverBulkStatus)
  ) {
    return POLL_INTERVAL_MS
  }
  if (status !== "reconciling") {
    return query.state.data?.isAutomationActive === false
      ? INACTIVE_POLL_INTERVAL_MS
      : false
  }
  return reconcilingForMs < FAST_RECONCILING_MS
    ? POLL_INTERVAL_MS
    : SLOW_POLL_INTERVAL_MS
}
