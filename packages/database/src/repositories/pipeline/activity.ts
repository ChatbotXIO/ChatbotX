import {
  and,
  type DatabaseClient,
  db,
  eq,
  gte,
  inArray,
  lte,
  sql,
} from "@chatbotx.io/database/client"
import { pipelineItemActivityModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { PipelineActivityKind } from "../../partials/pipeline"
import { zonedBucketKey } from "../../queries/date-bucket"
import { NEWEST_FIRST_SORT } from "./item"
import { clampPageLimit, cursorFor, decodeTimestampCursor } from "./item-cursor"

export type PipelineActivityInsert = Omit<
  typeof pipelineItemActivityModel.$inferInsert,
  "id"
>

export type PipelineActivityPage = {
  items: (typeof pipelineItemActivityModel.$inferSelect)[]
  nextCursor: string | null
}

export type PipelineAnalyticsRange = {
  workspaceId: string
  pipelineId: string
  from: Date
  to: Date
}

/** Kinds the analytics tiles and charts are derived from. */
const ANALYTICS_KINDS = [
  "created",
  "statusChanged",
] as const satisfies readonly PipelineActivityKind[]

export const pipelineActivityRepository = {
  /** Deletes up to `limit` activity rows of a pipeline; returns how many. */
  async deleteByPipelineBatch(
    input: { workspaceId: string; pipelineId: string; limit: number },
    tx: DatabaseClient,
  ) {
    const batch = tx
      .select({ id: pipelineItemActivityModel.id })
      .from(pipelineItemActivityModel)
      .where(
        and(
          eq(pipelineItemActivityModel.workspaceId, input.workspaceId),
          eq(pipelineItemActivityModel.pipelineId, input.pipelineId),
        ),
      )
      .limit(input.limit)
    const rows = await tx
      .delete(pipelineItemActivityModel)
      .where(
        and(
          // The partition key, so the delete touches one partition.
          eq(pipelineItemActivityModel.workspaceId, input.workspaceId),
          inArray(pipelineItemActivityModel.id, batch),
        ),
      )
      .returning({ id: pipelineItemActivityModel.id })
    return rows.length
  },

  /**
   * Clears the item titles kept in a deleted contact's history: they often
   * hold the contact's name. Counts, values and dates stay for analytics.
   */
  async scrubContactTitles(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.contactIds.length === 0) {
      return
    }
    await tx
      .update(pipelineItemActivityModel)
      .set({ itemTitle: "", fromTitle: null, toTitle: null })
      .where(
        and(
          eq(pipelineItemActivityModel.workspaceId, input.workspaceId),
          inArray(pipelineItemActivityModel.contactId, input.contactIds),
        ),
      )
  },

  async insertMany(rows: PipelineActivityInsert[], tx: DatabaseClient = db) {
    if (rows.length === 0) {
      return
    }
    await tx
      .insert(pipelineItemActivityModel)
      .values(rows.map((values) => ({ id: createId(), ...values })))
  },

  /**
   * Newest-first keyset page of an item's activity, on the same cursor
   * contract as comments (timestamp read as text, id tie-breaker).
   */
  async listForItem(
    input: {
      workspaceId: string
      itemId: string
      limit: number
      cursor?: string
      /** Only these kinds; every kind when omitted. */
      kinds?: readonly PipelineActivityKind[]
    },
    tx: DatabaseClient = db,
  ): Promise<PipelineActivityPage> {
    const limit = clampPageLimit(input.limit)
    const cursor = input.cursor
      ? decodeTimestampCursor(input.cursor, NEWEST_FIRST_SORT)
      : null
    const { occurredAt, id } = pipelineItemActivityModel
    const rows = await tx
      .select({
        activity: pipelineItemActivityModel,
        occurredAtText: sql<string>`${occurredAt}::text`,
      })
      .from(pipelineItemActivityModel)
      .where(
        and(
          eq(pipelineItemActivityModel.workspaceId, input.workspaceId),
          eq(pipelineItemActivityModel.itemId, input.itemId),
          input.kinds
            ? inArray(pipelineItemActivityModel.kind, [...input.kinds])
            : undefined,
          cursor
            ? sql`(${occurredAt}, ${id}) < (${cursor.sortValue}::timestamptz, ${cursor.id}::bigint)`
            : undefined,
        ),
      )
      .orderBy(sql`${occurredAt} desc`, sql`${id} desc`)
      .limit(limit + 1)

    const page = rows.slice(0, limit)
    const last = page.at(-1)
    return {
      items: page.map((row) => row.activity),
      nextCursor:
        rows.length > limit && last
          ? cursorFor(NEWEST_FIRST_SORT, {
              sortValue: last.occurredAtText,
              id: last.activity.id,
            })
          : null,
    }
  },

  /**
   * Transition counts per local day: items created, and items that moved to
   * `won` / `lost`, with their summed value. `created` rows carry the value
   * in `toValue`, status rows the value at closure.
   */
  async dailySeries(
    input: PipelineAnalyticsRange & { timezone: string },
    tx: DatabaseClient = db,
  ) {
    const day = zonedBucketKey(
      pipelineItemActivityModel.occurredAt,
      "day",
      input.timezone,
    )
    return await tx
      .select({
        day,
        kind: pipelineItemActivityModel.kind,
        toStatus: pipelineItemActivityModel.toStatus,
        count: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${pipelineItemActivityModel.toValue}), 0)::float8`,
      })
      .from(pipelineItemActivityModel)
      .where(analyticsWhere(input))
      // Positional: `day` binds the timezone as a parameter, and a repeated
      // expression would get different parameter numbers than the SELECT.
      .groupBy(
        sql`1`,
        pipelineItemActivityModel.kind,
        pipelineItemActivityModel.toStatus,
      )
  },

  /**
   * Same transitions grouped by who caused them: a user (whose id is null once
   * the user is deleted) or automation (flows, triggers, tokens, system).
   */
  async totalsByActor(input: PipelineAnalyticsRange, tx: DatabaseClient = db) {
    const isAutomation = sql<boolean>`(${pipelineItemActivityModel.actorKind} <> 'user')`
    return await tx
      .select({
        isAutomation,
        actorUserId: pipelineItemActivityModel.actorUserId,
        kind: pipelineItemActivityModel.kind,
        toStatus: pipelineItemActivityModel.toStatus,
        count: sql<number>`count(*)::int`,
        value: sql<number>`coalesce(sum(${pipelineItemActivityModel.toValue}), 0)::float8`,
      })
      .from(pipelineItemActivityModel)
      .where(analyticsWhere(input))
      .groupBy(
        isAutomation,
        pipelineItemActivityModel.actorUserId,
        pipelineItemActivityModel.kind,
        pipelineItemActivityModel.toStatus,
      )
  },
}

function analyticsWhere(input: PipelineAnalyticsRange) {
  return and(
    eq(pipelineItemActivityModel.workspaceId, input.workspaceId),
    eq(pipelineItemActivityModel.pipelineId, input.pipelineId),
    inArray(pipelineItemActivityModel.kind, [...ANALYTICS_KINDS]),
    gte(pipelineItemActivityModel.occurredAt, input.from),
    lte(pipelineItemActivityModel.occurredAt, input.to),
  )
}
