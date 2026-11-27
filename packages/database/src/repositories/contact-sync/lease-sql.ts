import { and, type DatabaseClient, inArray, sql } from "../../client"
import { CONTACT_SYNC_LIVE_STATUSES } from "../../partials"
import { contactSyncRunItemModel, contactSyncRunModel } from "../../schema"

/** SQL pieces the run lease, the sweeper and the terminal writes share. */

// Read lazily (never at module scope): a suite that mocks
// `@chatbotx.io/database/client` narrowly must still be able to import this file.

/** A released continuation nobody re-claimed within this is a lost enqueue. */
export const releasedStaleInterval = () => sql`INTERVAL '1 minute'`
/** Above the integration queue's lock duration, so a live chunk is never stolen. */
export const leaseStaleInterval = () => sql`INTERVAL '15 minutes'`

export const liveStatusList = () =>
  sql.join(
    CONTACT_SYNC_LIVE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )

/** The pause (if any) is over; a cancel never waits for it. */
export const pauseElapsed = () =>
  sql`(${contactSyncRunModel.pausedUntil} IS NULL
    OR ${contactSyncRunModel.pausedUntil} <= NOW()
    OR ${contactSyncRunModel.status} = 'cancelling')`

/** Live runs retried to exhaustion that nobody touched for a full lease. */
export const exhaustedRuns = (maxAttempts: number) =>
  and(
    sql`${contactSyncRunModel.attempts} >= ${maxAttempts}`,
    inArray(contactSyncRunModel.status, CONTACT_SYNC_LIVE_STATUSES),
    pauseElapsed(),
    sql`(${contactSyncRunModel.lastHeartbeatAt} IS NULL
      OR ${contactSyncRunModel.lastHeartbeatAt} < NOW() - ${leaseStaleInterval()})`,
    sql`${contactSyncRunModel.updatedAt} < NOW() - ${leaseStaleInterval()}`,
  )

/** Items of finished runs that never settled are shown as cancelled. */
export const closeOpenItems = async (runIds: string[], tx: DatabaseClient) => {
  await tx
    .update(contactSyncRunItemModel)
    .set({ status: "cancelled", finishedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        inArray(contactSyncRunItemModel.runId, runIds),
        inArray(contactSyncRunItemModel.status, ["pending", "running"]),
      ),
    )
}
