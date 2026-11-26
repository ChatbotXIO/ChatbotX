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
  discountCodeModel,
  dynamicImageModel,
  ecommerceOpenHoursModel,
  flowModel,
  igStoryAutomationModel,
  inboundWebhookModel,
  integrationWebchatModel,
  leaderboardModel,
  magicLinkModel,
  miniAppModel,
  minigameModel,
  pipelineModel,
  placeLocationModel,
  pollModel,
  productModel,
  questionnaireModel,
  reflinkModel,
  sequenceModel,
  tagModel,
  triggerModel,
  vendorModel,
} from "../../schema"
import { likeContains } from "../../utils"
import { miniAppNotPublishedRaw } from "../mini-app"

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

type KeysetColumns = Record<string, SQLWrapper> & { id: SQLWrapper }

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
      orderBy: Record<string, "asc">
    }) => Promise<({ id: string } & Record<string, unknown>)[]>
  },
  table: TTable,
  extraWhere?: Record<string, unknown>,
  /** A text column to surface as each row's `badge`. */
  badgeColumn?: string,
  /** The column the picker shows, searches and orders by (`name` unless the table has none). */
  labelColumn = "name",
) {
  const columns: Record<string, true> = {
    id: true,
    [labelColumn]: true,
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
      [labelColumn]: keyword ? { ilike: likeContains(keyword) } : undefined,
    }
    // The category's own raw predicate stays next to the keyset condition.
    const extraRaw = extraWhere?.RAW as
      | ((columnsOfTable: KeysetColumns) => SQL)
      | undefined
    const pageWhere = after
      ? {
          ...where,
          RAW: (columnsOfTable: KeysetColumns): SQL =>
            extraRaw
              ? sql`${extraRaw(columnsOfTable)} AND (${columnsOfTable[labelColumn]}, ${columnsOfTable.id}) > (${after.key}, ${after.id})`
              : sql`(${columnsOfTable[labelColumn]}, ${columnsOfTable.id}) > (${after.key}, ${after.id})`,
        }
      : where

    const [fetched, total] = await Promise.all([
      tableQuery.findMany({
        where: pageWhere,
        columns,
        limit: limit + 1,
        offset,
        orderBy: { [labelColumn]: "asc", id: "asc" },
      }),
      tx.$count(table, relationsFilterToSQL(table, where)),
    ])
    const { page: rows, hasMore } = takePage(fetched, limit)

    const allIds = await buildAllIds(isFirstPageOf(input), total, async () =>
      (
        await tableQuery.findMany({
          where,
          columns: { id: true, [labelColumn]: true },
          limit: ALL_IDS_CAP,
          offset: 0,
          orderBy: { [labelColumn]: "asc", id: "asc" },
        })
      ).map((row) => row.id),
    )

    return {
      rows: rows.map((row) => ({
        id: row.id,
        name: String(row[labelColumn]),
        ...(badgeColumn && typeof row[badgeColumn] === "string"
          ? { badge: row[badgeColumn] }
          : {}),
      })),
      total,
      allIds,
      hasMore,
      lastKey: rows.length > 0 ? String(rows.at(-1)?.[labelColumn]) : undefined,
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

  /** Both Instagram connection types; the type is shown as each row's badge. */
  listStoryAutomations: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(
      tx.query.igStoryAutomationModel,
      igStoryAutomationModel,
      undefined,
      "type",
    )(input, tx),

  listInboundWebhooks: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.inboundWebhookModel, inboundWebhookModel)(input, tx),

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

  listMagicLinks: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.magicLinkModel, magicLinkModel)(input, tx),

  listPolls: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.pollModel, pollModel)(input, tx),

  listDynamicImages: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.dynamicImageModel, dynamicImageModel)(input, tx),

  listPlaceLocations: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.placeLocationModel, placeLocationModel)(input, tx),

  /** A Mini App published to WhatsApp lives on the creator's number: never offered. */
  listMiniApps: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.miniAppModel, miniAppModel, {
      RAW: miniAppNotPublishedRaw,
    })(input, tx),

  listMinigames: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.minigameModel, minigameModel)(input, tx),

  listLeaderboards: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.leaderboardModel, leaderboardModel, {
      deletedAt: { isNull: true as const },
    })(input, tx),

  listOpenHours: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.ecommerceOpenHoursModel, ecommerceOpenHoursModel)(
      input,
      tx,
    ),

  /** The store's own vendors; a connected store's are mirrored, never copied. */
  listVendors: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(tx.query.vendorModel, vendorModel, {
      source: "chatbotx" as const,
    })(input, tx),

  /** The store's own codes, but not those limited to specific customers. */
  listDiscountCodes: (input: CategoryInput, tx: DatabaseClient = db) =>
    findAllQuery(
      tx.query.discountCodeModel,
      discountCodeModel,
      {
        source: "chatbotx" as const,
        eligibility: { ne: "specificCustomers" as const },
      },
      undefined,
      "code",
    )(input, tx),

  /** The one settings row of the workspace, if it has one (it has no name of its own). */
  async listStoreSettings(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const row = await tx.query.ecommerceSettingsModel.findFirst({
      where: { workspaceId: input.workspaceId },
      columns: { id: true },
    })
    const rows =
      row && isFirstPageOf(input)
        ? [{ id: row.id, name: "Store settings" }]
        : []
    return {
      rows,
      total: row ? 1 : 0,
      allIds: row ? [row.id] : [],
      hasMore: false,
      lastKey: rows.at(-1)?.name,
    }
  },

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
