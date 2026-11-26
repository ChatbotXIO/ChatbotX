import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  sql,
} from "../../client"
import { contactSyncRunModel } from "../../schema"
import type { ContactSyncRunModel } from "../../types"
import {
  closeOpenItems,
  exhaustedRuns,
  leaseStaleInterval,
  liveStatusList,
  pauseElapsed,
  releasedStaleInterval,
} from "./lease-sql"

export type PickedContactSyncRun = Pick<
  ContactSyncRunModel,
  "id" | "workspaceId" | "attempts" | "chunkSeq" | "status"
>

/**
 * What the one-minute sweeper (`scanContactSyncRuns`) does to runs: reopen a
 * released continuation, list and fail the exhausted, refund a dispatch, pick
 * the due. Spread into `contactSyncRunRepository`.
 */
export const contactSyncSweeperMethods = {
  /**
   * Sweeper fallback for a released continuation whose job could not be
   * enqueued: puts a `running` + no-token row back to `pending`.
   */
  async reopenReleased(
    input: { runId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(contactSyncRunModel)
      .set({ status: "pending", updatedAt: new Date() })
      .where(
        and(
          eq(contactSyncRunModel.id, input.runId),
          eq(contactSyncRunModel.status, "running"),
          isNull(contactSyncRunModel.claimToken),
          pauseElapsed(),
        ),
      )
      .returning({ id: contactSyncRunModel.id })
    return rows.length
  },

  /**
   * Live runs the sweeper retried to exhaustion and nobody touched for a full
   * lease, oldest first, at most `batchSize`: candidates for
   * `markMaxAttemptsFailed` once the caller checked none still has a chunk
   * waiting in the queue.
   */
  listExhausted(
    input: { maxAttempts: number; batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<Pick<ContactSyncRunModel, "id" | "chunkSeq" | "status">[]> {
    return tx
      .select({
        id: contactSyncRunModel.id,
        chunkSeq: contactSyncRunModel.chunkSeq,
        status: contactSyncRunModel.status,
      })
      .from(contactSyncRunModel)
      .where(exhaustedRuns(input.maxAttempts))
      .orderBy(contactSyncRunModel.createdAt)
      .limit(input.batchSize)
  },

  /**
   * Terminalizes the given runs that are still exhausted (`listExhausted`):
   * `cancelling` ends `cancelled`, everything else `failed`. Rows are taken
   * `FOR UPDATE SKIP LOCKED` and re-checked, so a run claimed or picked in
   * the meantime is left alone. Returns how many runs it ended.
   */
  async markMaxAttemptsFailed(
    input: { maxAttempts: number; errorCode: string; runIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<number> {
    if (input.runIds.length === 0) {
      return 0
    }
    return await tx.transaction(async (trx) => {
      const due = await trx
        .select({ id: contactSyncRunModel.id })
        .from(contactSyncRunModel)
        .where(
          and(
            inArray(contactSyncRunModel.id, input.runIds),
            exhaustedRuns(input.maxAttempts),
          ),
        )
        .for("update", { skipLocked: true })
      const runIds = due.map((row) => row.id)
      if (runIds.length === 0) {
        return 0
      }
      await trx
        .update(contactSyncRunModel)
        .set({
          status: sql`CASE WHEN ${contactSyncRunModel.status} = 'cancelling' THEN 'cancelled'::"contactSyncRunStatus" ELSE 'failed'::"contactSyncRunStatus" END`,
          currentError: input.errorCode,
          claimToken: null,
          pausedUntil: null,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(contactSyncRunModel.id, runIds))
      await closeOpenItems(runIds, trx)
      return runIds.length
    })
  },

  /**
   * Undoes what `pickDue` just did when the previous dispatch is still
   * queued, so a backed-up queue never burns the retry budget. Only while the
   * row still holds exactly the picked values.
   */
  async refundDispatch(
    input: { runId: string; attempts: number; chunkSeq: number },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(contactSyncRunModel)
      .set({
        attempts: sql`${contactSyncRunModel.attempts} - 1`,
        chunkSeq: sql`${contactSyncRunModel.chunkSeq} - 1`,
      })
      .where(
        and(
          eq(contactSyncRunModel.id, input.runId),
          eq(contactSyncRunModel.attempts, input.attempts),
          eq(contactSyncRunModel.chunkSeq, input.chunkSeq),
          gt(contactSyncRunModel.attempts, 0),
          gt(contactSyncRunModel.chunkSeq, 0),
        ),
      )
      .returning({ id: contactSyncRunModel.id })
    return rows.length > 0
  },

  /**
   * Claims due runs for the sweeper and burns one attempt each: a `pending`
   * run past the grace period, a run whose lease went stale (worker died), or
   * a released continuation never re-claimed. `cancelling` keeps its status.
   */
  async pickDue(
    input: { maxAttempts: number; batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<PickedContactSyncRun[]> {
    const picked = await tx.execute<PickedContactSyncRun>(sql`
      UPDATE "ContactSyncRun"
      SET attempts = attempts + 1,
          "chunkSeq" = "chunkSeq" + 1,
          status = CASE WHEN status = 'cancelling' THEN status ELSE 'pending' END,
          "updatedAt" = NOW()
      WHERE id IN (
        SELECT id FROM "ContactSyncRun"
        WHERE status IN (${liveStatusList()})
          AND attempts < ${input.maxAttempts}
          AND ("pausedUntil" IS NULL OR "pausedUntil" <= NOW() OR status = 'cancelling')
          AND (
            (status = 'pending' AND "updatedAt" < NOW() - INTERVAL '2 minutes')
            OR (status IN ('running', 'cancelling')
                AND "claimToken" IS NOT NULL
                AND "lastHeartbeatAt" < NOW() - ${leaseStaleInterval()})
            OR (status IN ('running', 'cancelling')
                AND "claimToken" IS NULL
                AND "lastHeartbeatAt" < NOW() - ${releasedStaleInterval()})
          )
        ORDER BY "createdAt" ASC
        LIMIT ${input.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "workspaceId", attempts, "chunkSeq", status
    `)
    return picked.rows
  },
}
