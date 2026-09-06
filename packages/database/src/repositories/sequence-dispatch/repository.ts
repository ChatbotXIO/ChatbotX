import { and, type DatabaseClient, db, eq, sql } from "../../client"
import { sequenceDispatchModel } from "../../schema"

type DispatchQueryResult = Awaited<
  ReturnType<
    typeof db.query.sequenceDispatchModel.findFirst<{
      with: { sequence: true; contact: true; enrollment: true }
    }>
  >
>

export type DispatchWithRelations = NonNullable<DispatchQueryResult>

type StepQueryResult = Awaited<
  ReturnType<
    typeof db.query.sequenceStepModel.findFirst<{ with: { flow: true } }>
  >
>

export type SequenceStepWithFlow = NonNullable<StepQueryResult>

export const sequenceDispatchRepository = {
  /** `dispatch-processor.service.ts` fetchDispatch. */
  async findWithRelations(
    input: { id: string; status: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<DispatchWithRelations | null> {
    const dispatch = await tx.query.sequenceDispatchModel.findFirst({
      where: {
        id: input.id,
        status: input.status,
        workspaceId: input.workspaceId,
      },
      with: {
        sequence: true,
        contact: true,
        enrollment: true,
      },
    })
    return dispatch ?? null
  },

  /**
   * `dispatch-processor.service.ts` lockDispatch: the `status = 'pending'`
   * predicate plus the affected-row check is the idempotency guard against a
   * concurrent worker claiming the same dispatch — never turn this into a
   * read-then-write. `lockOwner` is read from `process.env.HOSTNAME` by the
   * caller so this repository stays env-free.
   */
  async claim(
    input: { id: string; workspaceId: string; lockOwner: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const updated = await tx
      .update(sequenceDispatchModel)
      .set({
        status: "running",
        lockedAt: new Date(),
        lockOwner: input.lockOwner,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, input.id),
          eq(sequenceDispatchModel.workspaceId, input.workspaceId),
          eq(sequenceDispatchModel.status, "pending"),
        ),
      )
      .returning({ id: sequenceDispatchModel.id })

    return updated.length > 0
  },

  /** `worker-producer.ts` publishDispatches. */
  async listPendingWorkspaceIds(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx.query.sequenceDispatchModel.findMany({
      where: {
        id: { in: input.ids },
        status: "pending",
      },
      columns: { id: true, workspaceId: true },
    })
  },

  /**
   * `worker.ts` reconcile: paginated pending-dispatch scan for the bootstrap
   * window. `status=pending` intentionally prunes this scan to
   * `SequenceDispatch_pending` — this predicate documents a partial-index
   * dependency and must not be relaxed or reordered.
   */
  async listPendingForReconcile(
    input: { maxRunAtMs: string; offset: number; limit: number },
    tx: DatabaseClient = db,
  ): Promise<
    {
      id: string
      bucket: number
      runAtMs: string
      workspaceId: string
      contactId: string
    }[]
  > {
    return await tx.query.sequenceDispatchModel.findMany({
      // status=pending intentionally prunes this scan to SequenceDispatch_pending.
      where: {
        status: "pending",
        runAtMs: { lte: input.maxRunAtMs },
      },
      columns: {
        id: true,
        bucket: true,
        runAtMs: true,
        workspaceId: true,
        contactId: true,
      },
      orderBy: (d, { asc }) => [asc(d.runAtMs)],
      offset: input.offset,
      limit: input.limit,
    })
  },

  /** `worker.ts` cleanupOrphans: which candidate ids are still pending. */
  async listPendingIds(
    input: { ids: string[] },
    tx: DatabaseClient = db,
  ): Promise<{ id: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx.query.sequenceDispatchModel.findMany({
      where: {
        id: { in: input.ids },
        status: "pending",
      },
      columns: { id: true },
    })
  },

  /**
   * `worker.ts` deleteTerminalDispatches: the `sd."workspaceId" =
   * rows."workspaceId"` join predicate in the CTE is the partition-pruning
   * key — move verbatim, do not simplify to a plain `id IN (...)` delete.
   */
  async deleteTerminalBatch(
    input: { retentionTtlDays: number; batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const result = await tx.execute<{ id: string }>(sql`
      WITH rows AS (
        SELECT "id", "workspaceId"
        FROM "SequenceDispatch"
        WHERE "status" IN ('completed', 'failed', 'canceled')
          AND "updatedAt" < NOW() - (${input.retentionTtlDays} * INTERVAL '1 day')
        LIMIT ${input.batchSize}
      )
      DELETE FROM "SequenceDispatch" sd
      USING rows
      WHERE sd."id" = rows."id"
        AND sd."workspaceId" = rows."workspaceId"
      RETURNING sd."id"
    `)
    return result.rows.length
  },

  /** `step-executor.service.ts` fetchStep. */
  async findStepWithFlow(
    input: { id: string },
    tx: DatabaseClient = db,
  ): Promise<SequenceStepWithFlow | undefined> {
    return await tx.query.sequenceStepModel.findFirst({
      where: { id: input.id },
      with: { flow: true },
    })
  },
}
