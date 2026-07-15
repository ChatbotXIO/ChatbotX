import { workspaceLifecycleService } from "@chatbotx.io/business"
import { db, eq, sql } from "@chatbotx.io/database/client"
import { planStatuses } from "@chatbotx.io/database/partials"
import { userQuotaModel } from "@chatbotx.io/database/schema"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock } from "@chatbotx.io/redis"
import { allIntegrations } from "../../services/integrations"

const log = getChildLogger("unsubscribe-expired-trials")
const CHUNK_SIZE = 100
const GRACE_DAYS = 7
const LOCK_TTL_SECONDS = 55

export async function unsubscribeExpiredTrials(): Promise<void> {
  await distributedLock.runExclusive({
    key: "schedule:unsubscribe-expired-trials",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000)

      for (;;) {
        // The short claim transaction releases row locks before teardown; the
        // distributed lock serializes runs, while idempotency protects retries.
        const due = await db.transaction(async (tx) => {
          const rows = await tx.execute<{ userId: string }>(sql`
        SELECT "userId"
        FROM "UserQuota"
        WHERE "planStatus" = ${planStatuses.enum.trial}
          AND "periodEnd" IS NOT NULL
          AND "periodEnd" <= ${cutoff}
          AND "channelsTornDownAt" IS NULL
        ORDER BY "periodEnd" ASC, "userId" ASC
        LIMIT ${CHUNK_SIZE}
        FOR UPDATE SKIP LOCKED
      `)

          return rows.rows
        })

        if (due.length === 0) {
          break
        }

        for (const row of due) {
          try {
            await workspaceLifecycleService.deactivateOwnerWorkspaces({
              ownerId: row.userId,
              integrations: allIntegrations,
              teardownLevel: "disconnect",
            })

            await db
              .update(userQuotaModel)
              .set({ channelsTornDownAt: new Date() })
              .where(eq(userQuotaModel.userId, row.userId))
          } catch (err) {
            log.error(
              { err, ownerId: row.userId },
              "unsubscribeExpiredTrials: owner teardown failed",
            )
          }
        }

        if (due.length < CHUNK_SIZE) {
          break
        }
      }
    },
  })
}
