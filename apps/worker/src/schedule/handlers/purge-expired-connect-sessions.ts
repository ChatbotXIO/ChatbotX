import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { getChildLogger } from "@chatbotx.io/logger"

const log = getChildLogger("purge-expired-connect-sessions")

/** Matches the retention window every other short-lived/staging table in this codebase uses (`PARSE_FAILED_RETENTION_DAYS`, `GRACE_DAYS`). */
const TERMINAL_RETENTION_DAYS = 7
const CHUNK_SIZE = 500
const INTER_CHUNK_DELAY_MS = 100
const MAX_CHUNKS_PER_RUN = 1000

/**
 * Two sweeps over `ConnectSession`, both delegated to
 * `connectSessionService.purgeExpired`:
 * - Flips every row past `expiresAt` to `status = "expired"` in one bulk
 *   `UPDATE` and clears `encryptedAuth`. Every reader already treats a
 *   past-`expiresAt` row as expired regardless of its stored status
 *   (`ConnectSessionService`'s lazy `applyExpiryRule`), so this half is
 *   display/reporting hygiene and the `countActiveByWorkspaceId`
 *   pending-session cap, not a correctness dependency.
 * - Deletes terminal rows older than `TERMINAL_RETENTION_DAYS` — without
 *   this a finished `ConnectSession` row (and any `encryptedAuth` an
 *   earlier run hadn't cleared yet) never leaves the table.
 */
export async function purgeExpiredConnectSessions(): Promise<void> {
  const { expired, deletedTerminal, terminalPurgeStopReason } =
    await connectSessionService.purgeExpired({
      retentionDays: TERMINAL_RETENTION_DAYS,
      chunkSize: CHUNK_SIZE,
      interChunkDelayMs: INTER_CHUNK_DELAY_MS,
      maxChunks: MAX_CHUNKS_PER_RUN,
    })

  if (expired > 0) {
    log.info({ expired }, "purgeExpiredConnectSessions: sessions expired")
  }
  if (deletedTerminal > 0) {
    log.info(
      { deletedTerminal },
      "purgeExpiredConnectSessions: terminal rows purged",
    )
  }
  if (terminalPurgeStopReason !== "drained") {
    // Rows older than the retention window still remain — repeated across
    // runs this means ConnectSession is growing faster than retention can
    // clear it.
    log.warn(
      { deletedTerminal, terminalPurgeStopReason },
      "purgeExpiredConnectSessions: terminal purge stopped with a backlog remaining",
    )
  }
}
