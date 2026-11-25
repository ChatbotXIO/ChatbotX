import { socialPostRecurrenceService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"
import { isBlockedWorkspace } from "../../lib/is-blocked-workspace"
import { runJobWithAuditContext } from "../../lib/run-job-with-audit-context"

const LOCK_KEY = "schedule:materialize-social-post-recurrences"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 0
/** Series handled by one tick; the rest stay due and are picked up by the next. */
const SERIES_PER_TICK = 500
/** Pages one tick may read while looking for series that are not blocked. */
const MAX_PAGES_PER_TICK = 10

const log = getChildLogger("materialize-social-post-recurrences")

type DueCursor = { id: string; nextRunAt: Date }

/**
 * Where the next tick resumes when this one stopped before the end of the due
 * list. Blocked owners' series stay due without advancing, so without it they
 * would fill every page and starve the series behind them. Reset to the start
 * once a tick reaches the end of the list; losing it (a restart) only means
 * starting from the oldest series again.
 */
let resumeAfter: DueCursor | null = null

export type MaterializeSocialPostRecurrencesResult = {
  created: number
  failed: number
  scanned: number
  skippedBlocked: number
}

const run = async (): Promise<MaterializeSocialPostRecurrencesResult> => {
  const result: MaterializeSocialPostRecurrencesResult = {
    created: 0,
    failed: 0,
    scanned: 0,
    skippedBlocked: 0,
  }
  const blockedByWorkspace = new Map<string, boolean>()
  let cursor = resumeAfter
  let handled = 0
  for (
    let page = 0;
    page < MAX_PAGES_PER_TICK && handled < SERIES_PER_TICK;
    page += 1
  ) {
    const due = await socialPostRecurrenceService.listDue(
      SERIES_PER_TICK,
      cursor,
    )
    result.scanned += due.length
    for (const series of due) {
      // A blocked owner's series is left untouched and does not advance: the
      // slots it misses are accounted when it comes back (as missed, past the
      // late window), never lost silently.
      let blocked = blockedByWorkspace.get(series.workspaceId)
      if (blocked === undefined) {
        blocked = await isBlockedWorkspace(series.workspaceId)
        blockedByWorkspace.set(series.workspaceId, blocked)
      }
      if (blocked) {
        result.skippedBlocked += 1
        continue
      }
      handled += 1
      try {
        const settled = await runJobWithAuditContext(
          {
            source: "socialPostRecurrence:materialize",
            workspaceId: series.workspaceId,
          },
          () => socialPostRecurrenceService.materializeSeries(series),
        )
        result.created += settled.created
      } catch (err) {
        // One series' failure must not starve the others; the slot is retried
        // on a later tick (each slot is idempotent).
        result.failed += 1
        log.error(
          { err, recurrenceId: series.id },
          "Failed to materialize a recurring post",
        )
      }
    }
    const last = due.at(-1)
    if (due.length < SERIES_PER_TICK || !last) {
      resumeAfter = null
      return result
    }
    cursor = { id: last.id, nextRunAt: last.nextRunAt }
  }
  resumeAfter = cursor
  return result
}

/**
 * Runs every minute (`register-schedules.ts`): turns each due slot of a
 * running series into a scheduled post. Bounded per series by the service and
 * per tick here. A tick that finds the previous one still running is skipped.
 */
export async function materializeSocialPostRecurrences(): Promise<
  MaterializeSocialPostRecurrencesResult | undefined
> {
  try {
    const result = await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: run,
    })
    if (result.scanned > 0) {
      log.info(result, "materializeSocialPostRecurrences: tick done")
    }
    return result
  } catch (err) {
    if (
      isLockAcquisitionError(err, LOCK_KEY) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "materializeSocialPostRecurrences: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
