import {
  and,
  type DatabaseClient,
  db,
  eq,
  getTableColumns,
  inArray,
  sql,
} from "@chatbotx.io/database/client"
import {
  pipelineItemAssigneeModel,
  pipelineItemModel,
  pipelineStageModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  clampPageLimit,
  cursorFor,
  decodePipelineItemCursor,
  type PipelineItemSort,
  pipelineItemAfterCursor,
  pipelineItemOrderBy,
  pipelineItemSortValueText,
} from "./item-cursor"
import { buildPipelineItemWhere, type PipelineItemFilter } from "./item-filter"

export type PipelineItemInsert = Omit<
  typeof pipelineItemModel.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>
export type PipelineItemUpdate = Partial<
  Omit<
    typeof pipelineItemModel.$inferInsert,
    "id" | "createdAt" | "updatedAt" | "workspaceId" | "number"
  >
>

type ItemRow = typeof pipelineItemModel.$inferSelect

type PipelineItemPage = {
  items: ItemRow[]
  nextCursor: string | null
}

type PipelineStageTotals = {
  stageId: string
  count: number
  totalValue: number
}

type PipelineBoardStagePage = {
  stageId: string
  items: ItemRow[]
  /** Resumes right after the last item of `items`; null when the stage fits. */
  nextCursor: string | null
}

async function findByIdempotencyKey(
  input: { workspaceId: string; pipelineId: string; idempotencyKey: string },
  tx: DatabaseClient,
) {
  return await tx.query.pipelineItemModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      idempotencyKey: input.idempotencyKey,
    },
  })
}

type BatchScope = { workspaceId: string; pipelineId: string; stageId?: string }

const batchScopeWhere = (scope: BatchScope) =>
  and(
    eq(pipelineItemModel.workspaceId, scope.workspaceId),
    eq(pipelineItemModel.pipelineId, scope.pipelineId),
    scope.stageId ? eq(pipelineItemModel.stageId, scope.stageId) : undefined,
  )

/**
 * Ids of up to `limit` items in scope, as a subquery. Callers repeat the scope
 * in their outer WHERE: a candidate that left the scope while the statement
 * waited on its row lock is re-checked after the wait, so it is skipped
 * instead of being touched wherever it went.
 */
const batchIds = (tx: DatabaseClient, scope: BatchScope, limit: number) =>
  tx
    .select({ id: pipelineItemModel.id })
    .from(pipelineItemModel)
    .where(batchScopeWhere(scope))
    .limit(limit)

export const pipelineItemRepository = {
  async findById(
    input: { workspaceId: string; id: string; pipelineId?: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineItemModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
        ...(input.pipelineId ? { pipelineId: input.pipelineId } : {}),
      },
    })
  },

  async findByIdempotencyKey(
    input: { workspaceId: string; pipelineId: string; idempotencyKey: string },
    tx: DatabaseClient = db,
  ) {
    return await findByIdempotencyKey(input, tx)
  },

  /** Row lock for the rest of the transaction; serialises item mutations. */
  async lockForUpdate(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient,
  ) {
    const [row] = await tx
      .select()
      .from(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.id, input.id),
        ),
      )
      .for("update")
    return row
  },

  /**
   * Inserts the item, or returns the one an earlier call with the same
   * idempotency key stored. Only that key's conflict is absorbed: any other
   * unique violation (the item number) still raises.
   */
  async insertIdempotent(values: PipelineItemInsert, tx: DatabaseClient) {
    const insert = tx
      .insert(pipelineItemModel)
      .values({ id: createId(), ...values })
    if (!values.idempotencyKey) {
      const [row] = await insert.returning()
      if (!row) {
        throw new Error("Failed to insert pipeline item")
      }
      return { row, inserted: true as const }
    }
    const [row] = await insert
      .onConflictDoNothing({
        target: [
          pipelineItemModel.workspaceId,
          pipelineItemModel.pipelineId,
          pipelineItemModel.idempotencyKey,
        ],
        where: sql`"idempotencyKey" IS NOT NULL`,
      })
      .returning()
    if (row) {
      return { row, inserted: true as const }
    }
    const existing = await findByIdempotencyKey(
      {
        workspaceId: values.workspaceId,
        pipelineId: values.pipelineId,
        idempotencyKey: values.idempotencyKey,
      },
      tx,
    )
    if (!existing) {
      throw new Error("Pipeline item idempotency conflict without a row")
    }
    return { row: existing, inserted: false as const }
  },

  async update(
    input: { workspaceId: string; id: string; values: PipelineItemUpdate },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(pipelineItemModel)
      .set(input.values)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.id, input.id),
        ),
      )
      .returning()
    return row
  },

  /** Marks the item as changed (attachments etc.) without touching other columns. */
  async touch(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(pipelineItemModel)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.id, input.id),
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
      .delete(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.id, input.id),
        ),
      )
      .returning({ id: pipelineItemModel.id })
    return rows.length > 0
  },

  /** The contact's most recently created open item in a pipeline, if any. */
  async findLatestOpenForContact(
    input: { workspaceId: string; pipelineId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.pipelineItemModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        contactId: input.contactId,
        status: "open",
      },
      orderBy: { createdAt: "desc", id: "desc" },
    })
  },

  /** Counts a contact's open items in a pipeline, optionally leaving one out. */
  async countOpenForContact(
    input: {
      workspaceId: string
      pipelineId: string
      contactId: string
      exceptItemId?: string
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      pipelineItemModel,
      and(
        eq(pipelineItemModel.workspaceId, input.workspaceId),
        eq(pipelineItemModel.pipelineId, input.pipelineId),
        eq(pipelineItemModel.contactId, input.contactId),
        eq(pipelineItemModel.status, "open"),
        input.exceptItemId
          ? sql`${pipelineItemModel.id} <> ${input.exceptItemId}::bigint`
          : undefined,
      ),
    )
  },

  /** Every pipeline's items of one contact, newest first (inbox panel). */
  async listForContact(
    input: {
      workspaceId: string
      contactId: string
      pipelineIds?: string[]
      limit: number
    },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select()
      .from(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.workspaceId, input.workspaceId),
          eq(pipelineItemModel.contactId, input.contactId),
          input.pipelineIds
            ? inArray(pipelineItemModel.pipelineId, input.pipelineIds)
            : undefined,
        ),
      )
      .orderBy(sql`${pipelineItemModel.createdAt} desc`)
      .limit(input.limit)
  },

  /** One keyset page of a stage, or of the whole pipeline when `stageId` is omitted. */
  async listStagePage(
    input: {
      workspaceId: string
      pipelineId: string
      /** Omit to page across every stage (public list); set for a board column. */
      stageId?: string
      filter?: PipelineItemFilter
      sort: PipelineItemSort
      limit: number
      cursor?: string
    },
    tx: DatabaseClient = db,
  ): Promise<PipelineItemPage> {
    const limit = clampPageLimit(input.limit)
    const cursor = input.cursor
      ? decodePipelineItemCursor(input.cursor, input.sort)
      : null
    const where = and(
      buildPipelineItemWhere(
        { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
        {
          ...input.filter,
          ...(input.stageId ? { stageIds: [input.stageId] } : {}),
        },
      ),
      cursor ? pipelineItemAfterCursor(input.sort, cursor) : undefined,
    )
    const rows = await tx
      .select({
        item: pipelineItemModel,
        sortValue: pipelineItemSortValueText(input.sort),
      })
      .from(pipelineItemModel)
      .where(where)
      .orderBy(...pipelineItemOrderBy(input.sort))
      .limit(limit + 1)

    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      items: page.map((row) => row.item),
      nextCursor:
        rows.length > limit && last
          ? cursorFor(input.sort, {
              sortValue: last.sortValue,
              id: last.item.id,
            })
          : null,
    }
  },

  /**
   * First page of every stage of a pipeline: one `JOIN LATERAL` per stage, each
   * reading `perStageLimit + 1` rows through the (pipeline, stage, sort) index
   * and stopping there, however many items the stage holds. The extra row only
   * proves a next page exists; cursors come from the fetched rows. Stages with
   * no matching item are absent from the result.
   */
  async listBoardFirstPage(
    input: {
      workspaceId: string
      pipelineId: string
      filter?: PipelineItemFilter
      sort: PipelineItemSort
      perStageLimit: number
    },
    tx: DatabaseClient = db,
  ): Promise<PipelineBoardStagePage[]> {
    const limit = clampPageLimit(input.perStageLimit)
    const page = tx
      .select({
        ...getTableColumns(pipelineItemModel),
        sortValue: pipelineItemSortValueText(input.sort).as("sortValue"),
      })
      .from(pipelineItemModel)
      .where(
        and(
          eq(pipelineItemModel.stageId, pipelineStageModel.id),
          buildPipelineItemWhere(
            { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
            input.filter,
          ),
        ),
      )
      .orderBy(...pipelineItemOrderBy(input.sort))
      .limit(limit + 1)
      .as("page")
    const rows = await tx
      .select()
      .from(pipelineStageModel)
      .innerJoinLateral(page, sql`true`)
      .where(
        and(
          eq(pipelineStageModel.workspaceId, input.workspaceId),
          eq(pipelineStageModel.pipelineId, input.pipelineId),
        ),
      )
      // Row order out of a lateral join is not guaranteed; re-sorting the at
      // most `limit + 1` rows per stage is cheap and makes it explicit.
      .orderBy(
        pipelineStageModel.id,
        ...pipelineItemOrderBy(input.sort, {
          sortValueText: sql`${page.sortValue}`,
          id: sql`${page.id}`,
        }),
      )

    const byStage = Map.groupBy(
      rows.map((row) => row.page),
      (row) => row.stageId,
    )
    return [...byStage].map(([stageId, stageRows]) => {
      const kept = stageRows.slice(0, limit)
      const last = kept.at(-1)
      return {
        stageId,
        items: kept.map(({ sortValue: _sortValue, ...item }) => item),
        nextCursor:
          stageRows.length > limit && last ? cursorFor(input.sort, last) : null,
      }
    })
  },

  /** Count and summed value per stage for the column headers. */
  async listStageTotals(
    input: {
      workspaceId: string
      pipelineId: string
      filter?: PipelineItemFilter
    },
    tx: DatabaseClient = db,
  ): Promise<PipelineStageTotals[]> {
    return await tx
      .select({
        stageId: pipelineItemModel.stageId,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`coalesce(sum(${pipelineItemModel.value}), 0)::float8`,
      })
      .from(pipelineItemModel)
      .where(
        buildPipelineItemWhere(
          { workspaceId: input.workspaceId, pipelineId: input.pipelineId },
          input.filter,
        ),
      )
      .groupBy(pipelineItemModel.stageId)
  },

  async countByStage(
    input: { workspaceId: string; pipelineId: string; stageId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.$count(
      pipelineItemModel,
      and(
        eq(pipelineItemModel.workspaceId, input.workspaceId),
        eq(pipelineItemModel.pipelineId, input.pipelineId),
        eq(pipelineItemModel.stageId, input.stageId),
      ),
    )
  },

  /**
   * Moves up to `limit` items of a stage to another and returns their ids.
   * Naturally resumable: a rerun only sees what is still in the source stage.
   * A batch can come back short; callers stop on an empty stage, not a short run.
   */
  async moveStageItemsBatch(
    input: {
      workspaceId: string
      pipelineId: string
      fromStageId: string
      toStageId: string
      limit: number
      now: Date
    },
    tx: DatabaseClient,
  ) {
    const scope = {
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      stageId: input.fromStageId,
    }
    return await tx
      .update(pipelineItemModel)
      .set({ stageId: input.toStageId, stageEnteredAt: input.now })
      .where(
        and(
          inArray(pipelineItemModel.id, batchIds(tx, scope, input.limit)),
          batchScopeWhere(scope),
        ),
      )
      .returning()
  },

  /** Deletes up to `limit` items of a stage and returns what was removed. */
  async deleteStageItemsBatch(
    input: {
      workspaceId: string
      pipelineId: string
      stageId: string
      limit: number
    },
    tx: DatabaseClient,
  ) {
    const scope = {
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
    }
    return await tx
      .delete(pipelineItemModel)
      .where(
        and(
          inArray(pipelineItemModel.id, batchIds(tx, scope, input.limit)),
          batchScopeWhere(scope),
        ),
      )
      .returning()
  },

  /** Deletes up to `limit` items of a pipeline; returns how many were removed. */
  async deletePipelineItemsBatch(
    input: { workspaceId: string; pipelineId: string; limit: number },
    tx: DatabaseClient,
  ) {
    const scope = {
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
    }
    const rows = await tx
      .delete(pipelineItemModel)
      .where(
        and(
          inArray(pipelineItemModel.id, batchIds(tx, scope, input.limit)),
          batchScopeWhere(scope),
        ),
      )
      .returning({ id: pipelineItemModel.id })
    return rows.length
  },

  // Assignees ---------------------------------------------------------------

  async listAssigneesForItems(
    input: { workspaceId: string; itemIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.itemIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(pipelineItemAssigneeModel)
      .where(
        and(
          eq(pipelineItemAssigneeModel.workspaceId, input.workspaceId),
          inArray(pipelineItemAssigneeModel.itemId, input.itemIds),
        ),
      )
      .orderBy(
        pipelineItemAssigneeModel.createdAt,
        pipelineItemAssigneeModel.id,
      )
  },

  /**
   * Makes the assignee set exactly the given targets. Rows that stay are left
   * untouched so their `createdAt` keeps ordering the "primary" assignee; only
   * the difference is deleted and inserted.
   */
  async replaceAssignees(
    input: {
      workspaceId: string
      itemId: string
      workspaceMemberIds: string[]
      inboxTeamIds: string[]
    },
    tx: DatabaseClient,
  ) {
    const current = await tx
      .select()
      .from(pipelineItemAssigneeModel)
      .where(
        and(
          eq(pipelineItemAssigneeModel.workspaceId, input.workspaceId),
          eq(pipelineItemAssigneeModel.itemId, input.itemId),
        ),
      )
    const wantedMembers = new Set(input.workspaceMemberIds)
    const wantedTeams = new Set(input.inboxTeamIds)
    const keptMembers = new Set<string>()
    const keptTeams = new Set<string>()
    const removedIds: string[] = []
    for (const row of current) {
      if (row.workspaceMemberId && wantedMembers.has(row.workspaceMemberId)) {
        keptMembers.add(row.workspaceMemberId)
      } else if (row.inboxTeamId && wantedTeams.has(row.inboxTeamId)) {
        keptTeams.add(row.inboxTeamId)
      } else {
        removedIds.push(row.id)
      }
    }
    if (removedIds.length > 0) {
      await tx
        .delete(pipelineItemAssigneeModel)
        .where(inArray(pipelineItemAssigneeModel.id, removedIds))
    }
    const added = [
      ...input.workspaceMemberIds
        .filter((id) => !keptMembers.has(id))
        .map((workspaceMemberId) => ({ workspaceMemberId, inboxTeamId: null })),
      ...input.inboxTeamIds
        .filter((id) => !keptTeams.has(id))
        .map((inboxTeamId) => ({ workspaceMemberId: null, inboxTeamId })),
    ]
    if (added.length === 0) {
      return
    }
    await tx.insert(pipelineItemAssigneeModel).values(
      added.map((row) => ({
        id: createId(),
        workspaceId: input.workspaceId,
        itemId: input.itemId,
        ...row,
      })),
    )
  },
}
