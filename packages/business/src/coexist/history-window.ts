/**
 * WhatsApp Coexistence history-delivery rules.
 *
 * Meta pushes chat history for a freshly-onboarded Coexistence number in
 * phases over minutes-to-hours (documented worst case: ~24h), long after the
 * first webhook batch has been drained. A run must therefore stay alive until
 * Meta signals it is done — this module owns the single definition of "done"
 * and of the window after which we stop waiting.
 *
 * Pure constants + predicates only: no database, no queue, no logger. The
 * worker imports it through the `@chatbotx.io/business/coexist/history`
 * subpath so a flush job does not pull the whole business package in.
 */

/**
 * How long a WhatsApp coexist run may sit in `waiting` before the scheduler
 * gives up on Meta sending more history. Meta's documented ceiling for
 * delivering the full history payload set is 24 hours.
 */
export const WHATSAPP_COEXIST_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * `CoexistSyncRun.currentError` sentinels. These are machine-readable markers
 * (never user-facing prose) that the builder maps to copy — keep them stable.
 */
export const COEXIST_HISTORY_DECLINED_ERROR = "history_declined"
export const COEXIST_HISTORY_TIMEOUT_ERROR = "history_timeout"

/** Meta history phases: 0 = day 0–1, 1 = day 1–90, 2 = day 90–180 (last). */
const WHATSAPP_HISTORY_TERMINAL_PHASE = 2
/** `metadata.progress` is a percentage; 100 means the phase is complete. */
const WHATSAPP_HISTORY_TERMINAL_PROGRESS = 100

export type WhatsappHistoryProgress = {
  lastPhase: number | null | undefined
  syncProgress: number | null | undefined
}

/**
 * The ONE terminal-signal rule for WhatsApp coexist history.
 *
 * Meta marks the end of a history backfill with the last phase (2) reported at
 * 100% progress. Anything short of that — including phase 2 at 40%, or phase 1
 * at 100% — means more chunks are still coming and the run must keep waiting.
 *
 * `>=` rather than `===` on both fields so a future Meta phase or an
 * out-of-range progress value can never strand a run forever.
 */
export const isWhatsappHistoryTerminal = (
  progress: WhatsappHistoryProgress,
): boolean => {
  const { lastPhase, syncProgress } = progress
  if (lastPhase === null || lastPhase === undefined) {
    return false
  }
  if (syncProgress === null || syncProgress === undefined) {
    return false
  }
  return (
    lastPhase >= WHATSAPP_HISTORY_TERMINAL_PHASE &&
    syncProgress >= WHATSAPP_HISTORY_TERMINAL_PROGRESS
  )
}
