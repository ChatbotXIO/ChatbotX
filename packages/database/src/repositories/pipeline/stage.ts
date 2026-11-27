import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import { pipelineStageModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"

export type PipelineStageInsert = Omit<
  typeof pipelineStageModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type PipelineStageUpdate = Partial<
  Pick<
    typeof pipelineStageModel.$inferInsert,
    "name" | "description" | "textColor" | "backgroundColor" | "bulkJobId"
  >
>

export const pipelineStageRepository = {
  async listByPipeline(
    input: { workspaceId: string; pipelineId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineStageModel.findMany({
      where: { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
      orderBy: { position: "asc" },
    })
  },

  /** Stages of several pipelines in one query, in board order. */
  async listByPipelineIds(
    input: { workspaceId: string; pipelineIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.pipelineIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          inArray(pipelineStageModel.pipelineId, input.pipelineIds),
        ),
      )
      .orderBy(pipelineStageModel.pipelineId, pipelineStageModel.position)
  },

  /** Names (and pipelines) of the given stages in the workspace; deleted ones are absent. */
  async listNamesByIds(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select({
        id: pipelineStageModel.id,
        name: pipelineStageModel.name,
        pipelineId: pipelineStageModel.pipelineId,
      })
      .from(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          inArray(pipelineStageModel.id, input.ids),
        ),
      )
  },

  async findById(
    input: { workspaceId: string; pipelineId?: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineStageModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
        ...(input.pipelineId ? { pipelineId: input.pipelineId } : {}),
      },
    })
  },

  /**
   * Row lock held until the transaction ends. Writers that put an item into
   * a stage take the shared lock; removing the stage takes the exclusive one,
   * so an item can never be created into a stage that is being deleted.
   */
  async lockShared(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.id, input.id),
        ),
      )
      .for("share")
    return row
  },

  async lockExclusive(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.id, input.id),
        ),
      )
      .for("update")
    return row
  },

  async insert(values: PipelineStageInsert, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(pipelineStageModel)
      .values({ id: createId(), ...values })
      .returning()
    if (!row) {
      throw new Error("Failed to insert pipeline stage")
    }
    return row
  },

  async insertMany(rows: PipelineStageInsert[], tx: DatabaseClient = db) {
    if (rows.length === 0) {
      return []
    }
    return await tx
      .insert(pipelineStageModel)
      .values(rows.map((values) => ({ id: createId(), ...values })))
      .returning()
  },

  async update(
    input: {
      workspaceId: string
      pipelineId: string
      id: string
      values: PipelineStageUpdate
    },
    tx: DatabaseClient = db,
  ) {
    // An empty patch changes nothing: answer with the row instead of an
    // UPDATE with no columns, which drizzle rejects.
    if (Object.keys(input.values).length === 0) {
      return await pipelineStageRepository.findById(input, tx)
    }
    const [row] = await tx
      .update(pipelineStageModel)
      .set(input.values)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
          eq(pipelineStageModel.id, input.id),
        ),
      )
      .returning()
    return row
  },

  /** Clears the claim only while it is still `bulkJobId`; returns whether it was released. */
  async releaseBulkClaim(
    input: {
      workspaceId: string
      pipelineId: string
      id: string
      bulkJobId: string
    },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .update(pipelineStageModel)
      .set({ bulkJobId: null })
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
          eq(pipelineStageModel.id, input.id),
          eq(pipelineStageModel.bulkJobId, input.bulkJobId),
        ),
      )
      .returning({ id: pipelineStageModel.id })
    return rows.length > 0
  },

  async delete(
    input: { workspaceId: string; pipelineId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .delete(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
          eq(pipelineStageModel.id, input.id),
        ),
      )
      .returning({ id: pipelineStageModel.id })
    return rows.length > 0
  },

  async nextPosition(
    input: { workspaceId: string; pipelineId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({
        max: sql<number | null>`max(${pipelineStageModel.position})`,
      })
      .from(pipelineStageModel)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
        ),
      )
    return (row?.max ?? -1) + 1
  },

  /** Writes `position = index` for the given ids in a single statement. */
  async reorder(
    input: { workspaceId: string; pipelineId: string; stageIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.stageIds.length === 0) {
      return
    }
    const cases = sql.join(
      input.stageIds.map(
        (stageId, index) => sql`when ${stageId}::bigint then ${index}::int`,
      ),
      sql` `,
    )
    await tx
      .update(pipelineStageModel)
      .set({ position: sql`case ${pipelineStageModel.id} ${cases} end` })
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
          inArray(pipelineStageModel.id, input.stageIds),
        ),
      )
  },
}
