import {
  and,
  type DatabaseClient,
  db,
  eq,
  getTableColumns,
  inArray,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  pipelineItemAssigneeModel,
  pipelineItemModel,
  pipelineStageModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { PipelineItemPlacementEdge } from "../../partials/pipeline"
import {
  clampPageLimit,
  cursorFor,
  decodePipelineItemCursor,
  ManualSortRequiresStageError,
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

/** One stage of one pipeline: the scope a manual order lives in. */
export type PipelineStageScope = {
  workspaceId: string
  pipelineId: string
  stageId: string
}

/** An item's place in a stage's manual order, ordered by `(position, id)`; also a computed position to write for one item. */
export type PlacementAnchor = { id: string; position: number }

/** Which side of an anchor a neighbour is read from. */
export type NeighbourDirection = "before" | "after"

/**
 * Existing rows around a slot, ascending: `below` ends at the slot's lower
 * neighbour and `above` starts at its upper neighbour. A bound is the position
 * of the row just outside the window, or null where the stage ends.
 */
export type RespaceWindow = {
  below: PlacementAnchor[]
  above: PlacementAnchor[]
  lowerBound: number | null
  upperBound: number | null
}

/**
 * Most existing rows a respace reads and rewrites in total, so the sequence
 * with the moved item is at most `RESPACE_EXISTING_MAX + 1` (statements stay
 * bounded).
 */
export const RESPACE_EXISTING_MAX = 511

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

/** Stage rows in manual order, leaving one item (the one being placed) out. */
const stageScopeWhere = (scope: PipelineStageScope, excludeItemId?: string) =>
  and(
    batchScopeWhere(scope),
    excludeItemId
      ? sql`${pipelineItemModel.id} <> ${excludeItemId}::bigint`
      : undefined,
  )

type PivotSide = "below" | "above"

type WindowSide = { window: PlacementAnchor[]; bound: number | null }

/** `(position, id)` ORDER BY pair, the order the board and its index use. */
const manualOrder = (direction: SQL) => [
  sql`${pipelineItemModel.position} ${direction}`,
  sql`${pipelineItemModel.id} ${direction}`,
]

const emptyWindowSide = (): WindowSide => ({ window: [], bound: null })

/**
 * Up to `limit` rows from `pivot` outwards on one side of a slot (the pivot
 * itself included) plus whether a further row exists and where it sits. One
 * extra row is read: it is the bound, not part of the window.
 */
async function readWindowSide(
  input: {
    scope: PipelineStageScope
    excludeItemId?: string
    pivot: PlacementAnchor
    side: PivotSide
    limit: number
  },
  tx: DatabaseClient,
): Promise<WindowSide> {
  const { limit } = input
  const isBelow = input.side === "below"
  const pivotTuple = sql`(${input.pivot.position}::float8, ${input.pivot.id}::bigint)`
  const rows = await tx
    .select({ id: pipelineItemModel.id, position: pipelineItemModel.position })
    .from(pipelineItemModel)
    .where(
      and(
        stageScopeWhere(input.scope, input.excludeItemId),
        isBelow
          ? sql`(${pipelineItemModel.position}, ${pipelineItemModel.id}) <= ${pivotTuple}`
          : sql`(${pipelineItemModel.position}, ${pipelineItemModel.id}) >= ${pivotTuple}`,
      ),
    )
    .orderBy(...manualOrder(isBelow ? sql`desc` : sql`asc`))
    .limit(limit + 1)
  const window = rows.slice(0, limit)
  return {
    window: isBelow ? window.reverse() : window,
    bound: rows.length > limit ? (rows[limit]?.position ?? null) : null,
  }
}

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

  /**
   * The top (lowest) or bottom (highest) row of a stage's manual order, or null
   * for an empty stage. `excludeItemId` leaves the item being placed out so it
   * never anchors itself. Reads the `(position, id)` index.
   */
  async stageEdgeAnchor(
    input: PipelineStageScope & {
      edge: PipelineItemPlacementEdge
      excludeItemId?: string
    },
    tx: DatabaseClient,
  ): Promise<PlacementAnchor | null> {
    const direction = input.edge === "top" ? sql`asc` : sql`desc`
    const [row] = await tx
      .select({
        id: pipelineItemModel.id,
        position: pipelineItemModel.position,
      })
      .from(pipelineItemModel)
      .where(stageScopeWhere(input, input.excludeItemId))
      .orderBy(...manualOrder(direction))
      .limit(1)
    return row ?? null
  },

  /**
   * The item a caller names as `beforeItemId` / `afterItemId`, only if it sits
   * in this stage of this pipeline. A missing, deleted or foreign anchor is
   * undefined; the caller turns that into a validation error.
   */
  async findPlacementAnchor(
    input: PipelineStageScope & { itemId: string },
    tx: DatabaseClient,
  ): Promise<PlacementAnchor | undefined> {
    const [row] = await tx
      .select({
        id: pipelineItemModel.id,
        position: pipelineItemModel.position,
      })
      .from(pipelineItemModel)
      .where(
        and(batchScopeWhere(input), eq(pipelineItemModel.id, input.itemId)),
      )
      .limit(1)
    return row
  },

  /**
   * The row directly before or after `anchor` in `(position, id)` order, or
   * null at the end of the stage. One row comparison, `LIMIT 1`.
   */
  async neighbour(
    input: PipelineStageScope & {
      anchor: PlacementAnchor
      direction: NeighbourDirection
      excludeItemId?: string
    },
    tx: DatabaseClient,
  ): Promise<PlacementAnchor | null> {
    const isBefore = input.direction === "before"
    const anchorTuple = sql`(${input.anchor.position}::float8, ${input.anchor.id}::bigint)`
    const rowTuple = sql`(${pipelineItemModel.position}, ${pipelineItemModel.id})`
    const [row] = await tx
      .select({
        id: pipelineItemModel.id,
        position: pipelineItemModel.position,
      })
      .from(pipelineItemModel)
      .where(
        and(
          stageScopeWhere(input, input.excludeItemId),
          isBefore
            ? sql`${rowTuple} < ${anchorTuple}`
            : sql`${rowTuple} > ${anchorTuple}`,
        ),
      )
      .orderBy(...manualOrder(isBefore ? sql`desc` : sql`asc`))
      .limit(1)
    return row ?? null
  },

  /**
   * Rows around a slot for a local respace. The slot lies between `lower` and
   * `upper` (adjacent rows; null at an open end). Reads `belowLimit` rows down
   * from `lower` and `aboveLimit` rows up from `upper`, each side one keyset
   * read on the `(position, id)` index, and the bound row just outside each.
   */
  async listRespaceWindow(
    input: PipelineStageScope & {
      lower: PlacementAnchor | null
      upper: PlacementAnchor | null
      belowLimit: number
      aboveLimit: number
      excludeItemId?: string
    },
    tx: DatabaseClient,
  ): Promise<RespaceWindow> {
    // The total, not each side, is bounded: below first, above gets the rest.
    const belowLimit = Math.min(
      Math.max(input.belowLimit, 0),
      RESPACE_EXISTING_MAX,
    )
    const aboveLimit = Math.min(
      Math.max(input.aboveLimit, 0),
      RESPACE_EXISTING_MAX - belowLimit,
    )
    const below = input.lower
      ? await readWindowSide(
          {
            scope: input,
            excludeItemId: input.excludeItemId,
            pivot: input.lower,
            side: "below",
            limit: belowLimit,
          },
          tx,
        )
      : emptyWindowSide()
    const above = input.upper
      ? await readWindowSide(
          {
            scope: input,
            excludeItemId: input.excludeItemId,
            pivot: input.upper,
            side: "above",
            limit: aboveLimit,
          },
          tx,
        )
      : emptyWindowSide()
    return {
      below: below.window,
      above: above.window,
      lowerBound: below.bound,
      upperBound: above.bound,
    }
  },

  /**
   * Writes the given positions in one statement and returns how many rows were
   * written. The rows are first locked in ascending id (the multi-row writer
   * order), so two respaces cannot deadlock on each other. A row deleted
   * meanwhile is simply absent: the others still ascend. `updatedAt` is left
   * alone, a reorder is not a content change.
   */
  async setPositions(
    input: PipelineStageScope & { rows: PlacementAnchor[] },
    tx: DatabaseClient,
  ): Promise<number> {
    if (input.rows.length === 0) {
      return 0
    }
    if (input.rows.length > RESPACE_EXISTING_MAX + 1) {
      throw new RangeError("Too many pipeline item positions in one write")
    }
    if (input.rows.some((row) => !Number.isFinite(row.position))) {
      throw new RangeError("A pipeline item position must be finite")
    }
    await tx
      .select({ id: pipelineItemModel.id })
      .from(pipelineItemModel)
      .where(
        and(
          batchScopeWhere(input),
          inArray(
            pipelineItemModel.id,
            input.rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(pipelineItemModel.id)
      .for("update")
    const assigned = sql`(values ${sql.join(
      input.rows.map(
        (row) => sql`(${row.id}::bigint, ${row.position}::float8)`,
      ),
      sql`, `,
    )}) as "assigned"("id", "position")`
    const written = await tx
      .update(pipelineItemModel)
      .set({
        position: sql`"assigned"."position"`,
        updatedAt: sql`${pipelineItemModel.updatedAt}`,
      })
      .from(assigned)
      .where(
        and(
          batchScopeWhere(input),
          sql`${pipelineItemModel.id} = "assigned"."id"`,
        ),
      )
      .returning({ id: pipelineItemModel.id })
    return written.length
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
    const isSingleStage =
      Boolean(input.stageId) || input.filter?.stageIds?.length === 1
    if (input.sort.key === "manual" && !isSingleStage) {
      throw new ManualSortRequiresStageError()
    }
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
