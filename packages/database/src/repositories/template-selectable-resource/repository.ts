import { and, desc, type SQL, type SQLWrapper, sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import {
  aiAgentModel,
  aiFileModel,
  aiFunctionModel,
  aiMCPServerModel,
  appointmentCalendarModel,
  automatedResponseModel,
  commentAutomationModel,
  couponTopicModel,
  customFieldModel,
  flowModel,
  integrationWebchatModel,
  pipelineModel,
  productModel,
  questionnaireModel,
  reflinkModel,
  sequenceModel,
  tagModel,
  triggerModel,
} from "../../schema"
import { likeContains } from "../../utils"

const ALL_IDS_CAP = 1000

export type SelectableResourceRow = {
  id: string
  name: string
  /** A short label shown next to the row, e.g. the channel of a comment automation. */
  badge?: string
}

export type ListSelectableResourceRowsResult = {
  rows: SelectableResourceRow[]
  total: number
  allIds?: string[]
  /** Whether rows exist beyond this page (the page query reads one extra). */
  hasMore: boolean
  /** The sort key of the last row, for the next page's keyset cursor. */
  lastKey?: string
}

const buildAllIds = async (
  isFirstPage: boolean,
  total: number,
  findAllIds: () => Promise<string[]>,
): Promise<string[] | undefined> =>
  isFirstPage && total <= ALL_IDS_CAP ? await findAllIds() : undefined

/** The row the previous page ended on; `key` is the sort key (name, or a timestamp for keywords). */
export type SelectableKeysetCursor = { key: string; id: string }

type CategoryInput = {
  workspaceId: string
  keyword?: string | null
  /** Legacy numeric cursors only; new pages pass `after`. */
  offset: number
  limit: number
  after?: SelectableKeysetCursor
}

const isFirstPageOf = (input: CategoryInput): boolean =>
  input.offset === 0 && !input.after

/** Splits the `limit + 1` read into the page and whether another page exists. */
const takePage = <T>(
  rows: T[],
  limit: number,
): { page: T[]; hasMore: boolean } => ({
  page: rows.slice(0, limit),
  hasMore: rows.length > limit,
})

type KeysetColumns = { name: SQLWrapper; id: SQLWrapper }

/**
 * Shared shape behind 11 of the 12 `list*` categories below: a
 * `{id, name}`-selectable table filtered by `workspaceId` (+ optional
 * `deletedAt`/extra predicate) and an ILIKE `name` search, paginated with a
 * capped `allIds` "select all" list. `listKeywords` (no `name` column) and
 * `listSettings` (two tables, no search/pagination) are genuine special
 * cases and stay hand-written below.
 */
function findAllQuery<TTable extends PgTable>(
  tableQuery: {
    findMany: (args: {
      where: Record<string, unknown>
      columns: Record<string, true>
      limit: number
      offset: number
      orderBy: { name: "asc"; id: "asc" }
    }) => Promise<({ id: string; name: string } & Record<string, unknown>)[]>
  },
  table: TTable,
  extraWhere?: Record<string, unknown>,
  /** A text column to surface as each row's `badge`. */
  badgeColumn?: string,
) {
  const columns: Record<string, true> = {
    id: true,
    name: true,
    ...(badgeColumn ? { [badgeColumn]: true } : {}),
  }
  return async (
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> => {
    const { workspaceId, keyword, offset, limit, after } = input
    const where = {
      workspaceId,
      ...extraWhere,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }
    const pageWhere = after
      ? {
          ...where,
          RAW: (columnsOfTable: KeysetColumns): SQL =>
            sql`(${columnsOfTable.name}, ${columnsOfTable.id}) > (${after.key}, ${after.id})`,
        }
      : where

    const [fetched, total] = await Promise.all([
      tableQuery.findMany({
        where: pageWhere,
        columns,
        limit: limit + 1,
        offset,
        orderBy: { name: "asc", id: "asc" },
      }),
      tx.$count(table, relationsFilterToSQL(table, where)),
    ])
    const { page: rows, hasMore } = takePage(fetched, limit)

    const allIds = await buildAllIds(isFirstPageOf(input), total, async () =>
      (
        await tableQuery.findMany({
          where,
          columns: { id: true, name: true },
          limit: ALL_IDS_CAP,
          offset: 0,
          orderBy: { name: "asc", id: "asc" },
        })
      ).map((row) => row.id),
    )

    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        ...(badgeColumn && typeof row[badgeColumn] === "string"
          ? { badge: row[badgeColumn] }
          : {}),
      })),
      total,
      allIds,
      hasMore,
      lastKey: rows.at(-1)?.name,
    }
  }
}

export const templateSelectableResourceRepository = {
  listFlows: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.flowModel, flowModel)(input, tx),

  listTags: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.tagModel, tagModel, {
      deletedAt: { isNull: true as const },
    })(input, tx),

  listCustomFields: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.customFieldModel, customFieldModel)(input, tx),

  listProducts: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.productModel, productModel)(input, tx),

  listAIFunctions: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.aiFunctionModel, aiFunctionModel)(input, tx),

  listAIAgents: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.aiAgentModel, aiAgentModel)(input, tx),

  listCalendars: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.appointmentCalendarModel, appointmentCalendarModel, {
      deletedAt: { isNull: true as const },
    })(input, tx),

  listWebchats: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.integrationWebchatModel, integrationWebchatModel)(
      input,
      tx,
    ),

  listTriggers: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.triggerModel, triggerModel)(input, tx),

  listFbCommentAutomations: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(
      tx.query.commentAutomationModel,
      commentAutomationModel,
      undefined,
      "type",
    )(input, tx),

  listAIFiles: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.aiFileModel, aiFileModel)(input, tx),

  listAIMcpServers: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.aiMCPServerModel, aiMCPServerModel)(input, tx),

  listQuestionnaires: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.questionnaireModel, questionnaireModel, {
      deletedAt: { isNull: true as const },
    })(input, tx),

  listCouponTopics: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.couponTopicModel, couponTopicModel, {
      deletedAt: { isNull: true as const },
    })(input, tx),

  listPipelines: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.pipelineModel, pipelineModel)(input, tx),

  listSequences: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.sequenceModel, sequenceModel)(input, tx),

  listEntryPointLinks: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.reflinkModel, reflinkModel)(input, tx),

  /**
   * `AutomatedResponse` (Keywords) has no `name` column — inbound rows are
   * keyed by their `keywords` array and outbound rows by `text` — so the
   * picker label falls back through `text`, then the joined keyword list.
   * Search is done in the database on `keywords`/`text` directly rather than
   * post-filtering in memory, so pagination stays exact under a search term.
   *
   * "keywords" is the inbound half of `AutomatedResponse` — the outbound
   * half backs the unrelated "Page Automated Responses" comment-automation
   * feature, which has no export category of its own. Without this filter,
   * the picker would list a workspace's outbound rows under "Keywords" too.
   */
  async listKeywords(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit, after } = input
    const where = {
      workspaceId,
      type: "inbound" as const,
      ...(keyword
        ? {
            OR: [
              { text: { ilike: likeContains(keyword) } },
              { keywords: { arrayContains: [keyword] } },
            ],
          }
        : {}),
    }
    // The sort key is the microsecond timestamp read back as text: a JS Date
    // truncates to milliseconds and would skip or repeat rows on a page edge.
    const createdKey = sql<string>`${automatedResponseModel.createdAt}::text`
    const pageFilter = and(
      relationsFilterToSQL(automatedResponseModel, where),
      after
        ? sql`(${automatedResponseModel.createdAt}, ${automatedResponseModel.id}) < (${after.key}::timestamptz, ${after.id})`
        : undefined,
    )

    const [fetched, total] = await Promise.all([
      tx
        .select({
          id: automatedResponseModel.id,
          text: automatedResponseModel.text,
          keywords: automatedResponseModel.keywords,
          createdKey,
        })
        .from(automatedResponseModel)
        .where(pageFilter)
        .orderBy(
          desc(automatedResponseModel.createdAt),
          desc(automatedResponseModel.id),
        )
        .limit(limit + 1)
        .offset(offset),
      tx.$count(
        automatedResponseModel,
        relationsFilterToSQL(automatedResponseModel, where),
      ),
    ])
    const { page: rows, hasMore } = takePage(fetched, limit)

    const toLabel = (row: {
      text: string | null
      keywords: string[]
    }): string => row.text?.trim() || row.keywords.join(", ") || "(untitled)"

    const allIds = await buildAllIds(isFirstPageOf(input), total, async () =>
      (
        await tx.query.automatedResponseModel.findMany({
          where,
          columns: { id: true },
          limit: ALL_IDS_CAP,
          orderBy: { createdAt: "desc", id: "desc" },
        })
      ).map((row) => row.id),
    )

    return {
      rows: rows.map((row) => ({ id: row.id, name: toLabel(row) })),
      total,
      allIds,
      hasMore,
      lastKey: rows.at(-1)?.createdKey,
    }
  },

  /**
   * `settings` bundles two tables (`SavedReply` shortcut, `BotField` name)
   * under one category, mirroring `settingsAdapter`'s two-kind entries. One
   * `UNION ALL` does the `ilike` search, the (name, id) keyset page and the
   * count in the database, so Vietnamese names sort and match by the
   * database collation, never by JS `localeCompare`/`toLowerCase`.
   */
  async listSettings(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit, after } = input
    const search = keyword
      ? sql`WHERE s."name" ILIKE ${likeContains(keyword)}`
      : sql``
    const union = sql`(
      SELECT "id", "shortcut" AS "name" FROM "SavedReply" WHERE "workspaceId" = ${workspaceId}
      UNION ALL
      SELECT "id", "name" FROM "BotField" WHERE "workspaceId" = ${workspaceId}
    ) s`
    const afterFilter = after
      ? sql`${keyword ? sql` AND` : sql`WHERE`} (s."name", s."id") > (${after.key}, ${after.id})`
      : sql``

    const [pageResult, countResult] = await Promise.all([
      tx.execute<{ id: string; name: string }>(sql`
        SELECT s."id"::text AS "id", s."name" AS "name" FROM ${union}
        ${search} ${afterFilter}
        ORDER BY s."name" ASC, s."id" ASC
        LIMIT ${limit + 1} OFFSET ${offset}
      `),
      tx.execute<{ total: string }>(
        sql`SELECT COUNT(*) AS "total" FROM ${union} ${search}`,
      ),
    ])
    const { page: rows, hasMore } = takePage(pageResult.rows, limit)
    const total = Number(countResult.rows[0]?.total ?? 0)

    const allIds = await buildAllIds(isFirstPageOf(input), total, async () =>
      (
        await tx.execute<{ id: string }>(sql`
          SELECT s."id"::text AS "id" FROM ${union} ${search}
          ORDER BY s."name" ASC, s."id" ASC LIMIT ${ALL_IDS_CAP}
        `)
      ).rows.map((row) => row.id),
    )

    return {
      rows: rows.map((row) => ({ id: row.id, name: row.name })),
      total,
      allIds,
      hasMore,
      lastKey: rows.at(-1)?.name,
    }
  },
}
