import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import type { BroadcastTerminalStatus } from "@chatbotx.io/database/partials"
import {
  isBroadcastOutcomeGraceElapsed,
  resolveBroadcastTerminalStatus,
} from "@chatbotx.io/database/partials"
import { distributedLock } from "@chatbotx.io/redis"
import { logger } from "../../lib/logger"

const LOCK_KEY = "schedule:finalize-broadcasts"
const AUDIT_SOURCE = "schedule:finalizeBroadcasts"
const LOCK_TTL_SECONDS = 55
const MAX_MISSING_CONTACTS_FOR_THRESHOLD = 100
const MISSING_RATE_THRESHOLD = 0.01

/**
 * Finalization is the single terminal owner for a broadcast, so it is also the
 * single place the terminal audit entry is emitted. Keyed by the resolved
 * status so adding a terminal status forces an entry here instead of growing a
 * ternary chain.
 */
const TERMINAL_AUDIT: Record<
  BroadcastTerminalStatus,
  { action: string; detail: (broadcastId: string) => string }
> = {
  sent: {
    action: "broadcast_sent",
    detail: (broadcastId) => `sent a broadcast (#${broadcastId})`,
  },
  failed: {
    action: "broadcast_failed",
    detail: (broadcastId) => `broadcast failed (#${broadcastId})`,
  },
}

/**
 * Resolves `sending → sent | failed` for broadcasts whose hand-off completed,
 * once every recipient has an outcome (within the existing tolerance) or the
 * outcome grace window elapsed. Terminal writes are conditional on the row
 * still being `sending` with hand-off set, so concurrent runs cannot double-apply.
 * A thrown error leaves every row untouched; the next minute's run retries.
 */
export const finalizeBroadcasts = async () =>
  distributedLock.runExclusive({
    key: LOCK_KEY,
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const broadcasts = await broadcastService.listAwaitingFinalization()
      const now = new Date()
      let finalized = 0
      let failed = 0

      for (const broadcast of broadcasts) {
        const total = broadcast.contactCount
        const hasContacts = total !== null && total > 0

        // Legacy/edge rows hand off with a null or zero contactCount; there is
        // nothing to count outcomes for, so treat them as immediately complete
        // and let resolveBroadcastTerminalStatus (which already maps this
        // input to "sent") settle the status below.
        const outcomes = hasContacts
          ? await broadcastService.countRecipientOutcomes({
              broadcastId: broadcast.id,
            })
          : { completed: 0, failed: 0 }
        const missingCount = hasContacts ? total - outcomes.completed : 0
        const isMissingThreshold =
          hasContacts &&
          missingCount <= MAX_MISSING_CONTACTS_FOR_THRESHOLD &&
          missingCount / total <= MISSING_RATE_THRESHOLD
        const isComplete =
          !hasContacts || outcomes.completed >= total || isMissingThreshold
        const graceElapsed = isBroadcastOutcomeGraceElapsed({
          handoffCompletedAt: broadcast.handoffCompletedAt,
          now,
        })

        if (!(isComplete || graceElapsed)) {
          continue
        }

        const status = resolveBroadcastTerminalStatus({
          contactCount: total,
          failedCount: outcomes.failed,
        })
        const applied = await broadcastService.completeSending({
          broadcastId: broadcast.id,
          status,
        })
        if (!applied) {
          continue
        }

        // `completeSending` is conditional on the row still being `sending`, so
        // a losing racer returns false above and never double-audits.
        const audit = TERMINAL_AUDIT[status]
        await auditService.record({
          action: audit.action,
          detail: audit.detail(broadcast.id),
          workspaceId: broadcast.workspaceId,
          source: AUDIT_SOURCE,
        })

        if (status === "failed") {
          failed++
        } else {
          finalized++
        }
      }

      logger.info({ finalized, failed }, "finalizeBroadcasts completed")
      return { skipped: false, finalized, failed }
    },
  })
