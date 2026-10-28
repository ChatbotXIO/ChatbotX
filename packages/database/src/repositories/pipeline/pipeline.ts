import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  like,
  sql,
} from "@chatbotx.io/database/client"
import {
  pipelineFieldModel,
  pipelineItemCounterModel,
  pipelineItemModel,
  pipelineMemberModel,
  pipelineModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { escapeLikePattern } from "../../utils"

export type PipelineInsert = Omit<
  typeof pipelineModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type PipelineUpdate = Partial<
  Pick<
    typeof pipelineModel.$inferInsert,
    "name" | "referenceName" | "currency" | "settings"
  >
>
export type PipelineFieldInsert = Omit<
  typeof pipelineFieldModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type PipelineMemberValues = Pick<
  typeof pipelineMemberModel.$inferInsert,
  "canManageSettings" | "canView" | "canEdit" | "canDelete"
>

/**
 * Serialises a critical section per `key` for the rest of the surrounding
 * transaction. Keys are built by the service, never from raw request text.
 */
export async function acquirePipelineAdvisoryLock(
  tx: DatabaseClient,
  key: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  )
}

export const pipelineRepository = {
  async findById(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineModel.findFirst({
      where: { workspaceId: input.workspaceId, id: input.id },
    })
  },

  async findByReferenceName(
    input: { workspaceId: string; referenceName: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        referenceName: input.referenceName,
      },
    })
  },

  async findByName(
    input: { workspaceId: string; name: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineModel.findFirst({
      where: { workspaceId: input.workspaceId, name: input.name },
    })
  },

  /** Every pipeline of a workspace, oldest first. */
  async listByWorkspace(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.pipelineModel.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    })
  },

  /** The workspace's pipeline ids in id order after `afterId`: keyset pages for a workspace-wide notification. */
  async listIdsPage(
    input: { workspaceId: string; afterId: string | null; limit: number },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx.query.pipelineModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.afterId ? { id: { gt: input.afterId } } : {}),
      },
      columns: { id: true },
      orderBy: { id: "asc" },
      limit: input.limit,
    })
    return rows.map((row) => row.id)
  },

  /** Item count per pipeline of the workspace; pipelines without items are absent. */
  async countItemsByPipeline(workspaceId: string, tx: DatabaseClient = db) {
    const rows = await tx
      .select({
        pipelineId: pipelineItemModel.pipelineId,
        itemsCount: sql<number>`count(*)::int`,
      })
      .from(pipelineItemModel)
      .where(eq(pipelineItemModel.workspaceId, workspaceId))
      .groupBy(pipelineItemModel.pipelineId)
    return rows
  },

  /** Names/reference names that start with `prefix`, for suffix allocation. */
  async listNamesStartingWith(
    input: {
      workspaceId: string
      column: "name" | "referenceName"
      prefix: string
    },
    tx: DatabaseClient = db,
  ) {
    const column = pipelineModel[input.column]
    const rows = await tx
      .select({ value: column })
      .from(pipelineModel)
      .where(
        and(
          eq(pipelineModel.workspaceId, input.workspaceId),
          like(column, `${escapeLikePattern(input.prefix)}%`),
        ),
      )
    return rows.map((row) => row.value)
  },

  async insert(values: PipelineInsert, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(pipelineModel)
      .values({ id: createId(), ...values })
      .returning()
    if (!row) {
      throw new Error("Failed to insert pipeline")
    }
    return row
  },

  async update(
    input: { workspaceId: string; id: string; values: PipelineUpdate },
    tx: DatabaseClient = db,
  ) {
    // An empty patch changes nothing: answer with the row instead of an
    // UPDATE with no columns, which drizzle rejects.
    if (Object.keys(input.values).length === 0) {
      return await pipelineRepository.findById(input, tx)
    }
    const [row] = await tx
      .update(pipelineModel)
      .set(input.values)
      .where(
        and(
          eq(pipelineModel.workspaceId, input.workspaceId),
          eq(pipelineModel.id, input.id),
        ),
      )
      .returning()
    return row
  },

  async delete(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .delete(pipelineModel)
      .where(
        and(
          eq(pipelineModel.workspaceId, input.workspaceId),
          eq(pipelineModel.id, input.id),
        ),
      )
      .returning({ id: pipelineModel.id })
    return rows.length > 0
  },

  /**
   * Hands out the next item number. The upsert holds the counter row lock
   * until the surrounding transaction ends, so a rolled-back item gives its
   * number back. Must run inside the transaction that inserts the item.
   */
  async nextItemNumber(workspaceId: string, tx: DatabaseClient) {
    const [row] = await tx
      .insert(pipelineItemCounterModel)
      .values({ workspaceId, lastNumber: 1 })
      .onConflictDoUpdate({
        target: pipelineItemCounterModel.workspaceId,
        set: { lastNumber: sql`${pipelineItemCounterModel.lastNumber} + 1` },
      })
      .returning({ lastNumber: pipelineItemCounterModel.lastNumber })
    if (!row) {
      throw new Error("Failed to allocate a pipeline item number")
    }
    return row.lastNumber
  },

  async listFields(
    input: { workspaceId: string; pipelineId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineFieldModel.findMany({
      where: { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
      // `id` breaks ties so the order is stable even if two positions match.
      orderBy: { position: "asc", id: "asc" },
    })
  },

  /** Custom fields of several pipelines in one query, in display order. */
  async listFieldsByPipelineIds(
    input: { workspaceId: string; pipelineIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.pipelineIds.length === 0) {
      return []
    }
    return await tx.query.pipelineFieldModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        pipelineId: { in: input.pipelineIds },
      },
      orderBy: { position: "asc", id: "asc" },
    })
  },

  async insertField(values: PipelineFieldInsert, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(pipelineFieldModel)
      .values({ id: createId(), ...values })
      .returning()
    if (!row) {
      throw new Error("Failed to insert pipeline field")
    }
    return row
  },

  async insertFields(rows: PipelineFieldInsert[], tx: DatabaseClient = db) {
    if (rows.length === 0) {
      return
    }
    await tx
      .insert(pipelineFieldModel)
      .values(rows.map((values) => ({ id: createId(), ...values })))
  },

  async updateField(
    input: {
      workspaceId: string
      pipelineId: string
      id: string
      values: Partial<
        Pick<
          typeof pipelineFieldModel.$inferInsert,
          "name" | "referenceName" | "required" | "position"
        >
      >
    },
    tx: DatabaseClient = db,
  ) {
    if (Object.keys(input.values).length === 0) {
      return await tx.query.pipelineFieldModel.findFirst({
        where: {
          workspaceId: input.workspaceId,
          pipelineId: input.pipelineId,
          id: input.id,
        },
      })
    }
    const [row] = await tx
      .update(pipelineFieldModel)
      .set(input.values)
      .where(
        and(
          eq(pipelineFieldModel.workspaceId, input.workspaceId),
          eq(pipelineFieldModel.pipelineId, input.pipelineId),
          eq(pipelineFieldModel.id, input.id),
        ),
      )
      .returning()
    return row
  },

  /**
   * Share-locks the named field rows (in id order, so writers cannot deadlock)
   * and returns the ids that still exist. A concurrent `deleteField` takes the
   * exclusive row lock, so it waits for writers holding this and later writers
   * find the row gone.
   */
  async lockFieldsShared(
    input: { workspaceId: string; pipelineId: string; ids: string[] },
    tx: DatabaseClient,
  ) {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: pipelineFieldModel.id })
      .from(pipelineFieldModel)
      .where(
        and(
          eq(pipelineFieldModel.workspaceId, input.workspaceId),
          eq(pipelineFieldModel.pipelineId, input.pipelineId),
          inArray(pipelineFieldModel.id, input.ids),
        ),
      )
      .orderBy(pipelineFieldModel.id)
      .for("share")
    return rows.map((row) => row.id)
  },

  async deleteField(
    input: { workspaceId: string; pipelineId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .delete(pipelineFieldModel)
      .where(
        and(
          eq(pipelineFieldModel.workspaceId, input.workspaceId),
          eq(pipelineFieldModel.pipelineId, input.pipelineId),
          eq(pipelineFieldModel.id, input.id),
        ),
      )
      .returning({ id: pipelineFieldModel.id })
    return rows.length > 0
  },

  /**
   * Removes a deleted field's key from the next `limit` items (by id, after
   * `afterId`) that still hold it. A keyset walk: the caller passes back
   * `lastId` and stops when `scanned < limit`, so no batch rescans earlier
   * rows. Maintenance only: `updatedAt` is kept, and the outer WHERE repeats
   * the scope so a row that changed while waiting on its lock is re-checked.
   */
  async stripFieldKeyBatch(
    input: {
      workspaceId: string
      pipelineId: string
      fieldId: string
      limit: number
      afterId?: string
    },
    tx: DatabaseClient = db,
  ) {
    const hasKey = sql`${pipelineItemModel.fieldValues} ? ${input.fieldId}::text`
    const candidates = await tx
      .select({ id: pipelineItemModel.id })
      .from(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.pipelineId, input.pipelineId),
          hasKey,
          input.afterId
            ? sql`${pipelineItemModel.id} > ${input.afterId}::bigint`
            : undefined,
        ),
      )
      .orderBy(pipelineItemModel.id)
      .limit(input.limit)
    if (candidates.length === 0) {
      return { scanned: 0, stripped: 0, lastId: input.afterId ?? null }
    }
    const rows = await tx
      .update(pipelineItemModel)
      .set({
        fieldValues: sql`${pipelineItemModel.fieldValues} - ${input.fieldId}::text`,
        updatedAt: sql`${pipelineItemModel.updatedAt}`,
      })
      .where(
        and(
          inArray(
            pipelineItemModel.id,
            candidates.map((row) => row.id),
          ),
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.pipelineId, input.pipelineId),
          hasKey,
        ),
      )
      .returning({ id: pipelineItemModel.id })
    return {
      scanned: candidates.length,
      stripped: rows.length,
      lastId: candidates.at(-1)?.id ?? null,
    }
  },

  async listMembers(
    input: { workspaceId: string; pipelineId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineMemberModel.findMany({
      where: { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
    })
  },

  async findMember(
    input: {
      workspaceId: string
      pipelineId: string
      workspaceMemberId: string
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineMemberModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        workspaceMemberId: input.workspaceMemberId,
      },
    })
  },

  /** A member's ACL rows across the workspace, for list filtering and per-row permissions. */
  async listMemberAccess(
    input: { workspaceId: string; workspaceMemberId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        pipelineId: pipelineMemberModel.pipelineId,
        canView: pipelineMemberModel.canView,
        canEdit: pipelineMemberModel.canEdit,
        canDelete: pipelineMemberModel.canDelete,
        canManageSettings: pipelineMemberModel.canManageSettings,
      })
      .from(pipelineMemberModel)
      .where(
        and(
          eq(pipelineMemberModel.workspaceId, input.workspaceId),
          eq(pipelineMemberModel.workspaceMemberId, input.workspaceMemberId),
        ),
      )
  },

  async upsertMember(
    input: {
      workspaceId: string
      pipelineId: string
      workspaceMemberId: string
      values: PipelineMemberValues
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(pipelineMemberModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        workspaceMemberId: input.workspaceMemberId,
        ...input.values,
      })
      .onConflictDoUpdate({
        target: [
          pipelineMemberModel.pipelineId,
          pipelineMemberModel.workspaceMemberId,
        ],
        set: input.values,
      })
      .returning()
    if (!row) {
      throw new Error("Failed to upsert pipeline member")
    }
    return row
  },

  async deleteMember(
    input: {
      workspaceId: string
      pipelineId: string
      workspaceMemberId: string
    },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .delete(pipelineMemberModel)
      .where(
        and(
          eq(pipelineMemberModel.workspaceId, input.workspaceId),
          eq(pipelineMemberModel.pipelineId, input.pipelineId),
          eq(pipelineMemberModel.workspaceMemberId, input.workspaceMemberId),
        ),
      )
      .returning({ id: pipelineMemberModel.id })
    return rows.length > 0
  },

  async insertMembers(
    rows: Array<
      PipelineMemberValues & {
        workspaceId: string
        pipelineId: string
        workspaceMemberId: string
      }
    >,
    tx: DatabaseClient = db,
  ) {
    if (rows.length === 0) {
      return
    }
    await tx
      .insert(pipelineMemberModel)
      .values(rows.map((values) => ({ id: createId(), ...values })))
  },
}
