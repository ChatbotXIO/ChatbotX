import type { PgTable } from "drizzle-orm/pg-core"
import { type DatabaseClient, db, relationsFilterToSQL } from "../../client"
import {
  aiAgentModel,
  aiFunctionModel,
  appointmentCalendarModel,
  automatedResponseModel,
  customFieldModel,
  fbCommentAutomationModel,
  flowModel,
  integrationWebchatModel,
  productModel,
  reflinkModel,
  tagModel,
  triggerModel,
} from "../../schema"
import { likeContains } from "../../utils"

const ALL_IDS_CAP = 1000

export type SelectableResourceRow = {
  id: string
  name: string
}

export type ListSelectableResourceRowsResult = {
  rows: SelectableResourceRow[]
  total: number
  allIds?: string[]
}

const buildAllIds = async (
  offset: number,
  total: number,
  findAllIds: () => Promise<string[]>,
): Promise<string[] | undefined> =>
  offset === 0 && total <= ALL_IDS_CAP ? await findAllIds() : undefined

type CategoryInput = {
  workspaceId: string
  keyword?: string | null
  offset: number
  limit: number
}

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
      columns: { id: true; name: true }
      limit: number
      offset: number
      orderBy: { name: "asc" }
    }) => Promise<{ id: string; name: string }[]>
  },
  table: TTable,
  extraWhere?: Record<string, unknown>,
) {
  return async (
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> => {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      ...extraWhere,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tableQuery.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(table, relationsFilterToSQL(table, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tableQuery.findMany({
          where,
          columns: { id: true, name: true },
          limit: ALL_IDS_CAP,
          offset: 0,
          orderBy: { name: "asc" },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
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
    findAllQuery(tx.query.fbCommentAutomationModel, fbCommentAutomationModel)(
      input,
      tx,
    ),

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
    const { workspaceId, keyword, offset, limit } = input
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

    const [rows, total] = await Promise.all([
      tx.query.automatedResponseModel.findMany({
        where,
        columns: { id: true, text: true, keywords: true },
        limit,
        offset,
        orderBy: { createdAt: "desc" },
      }),
      tx.$count(
        automatedResponseModel,
        relationsFilterToSQL(automatedResponseModel, where),
      ),
    ])

    const toLabel = (row: {
      text: string | null
      keywords: string[]
    }): string => row.text?.trim() || row.keywords.join(", ") || "(untitled)"

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.automatedResponseModel.findMany({
          where,
          columns: { id: true },
          limit: ALL_IDS_CAP,
        })
      ).map((row) => row.id),
    )

    return {
      rows: rows.map((row) => ({ id: row.id, name: toLabel(row) })),
      total,
      allIds,
    }
  },

  /**
   * `settings` bundles two tables (`SavedReply`, `BotField`) under one
   * category, mirroring `settingsAdapter`'s two-kind entries. Returns the two
   * raw arrays — the in-memory merge/sort/filter/paginate is presentation
   * logic and stays in the builder query, not here.
   */
  async listSettings(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<{
    savedReplies: { id: string; shortcut: string }[]
    botFields: { id: string; name: string }[]
  }> {
    const [savedReplies, botFields] = await Promise.all([
      tx.query.savedReplyModel.findMany({
        where: { workspaceId },
        columns: { id: true, shortcut: true },
      }),
      tx.query.botFieldModel.findMany({
        where: { workspaceId },
        columns: { id: true, name: true },
      }),
    ])

    return { savedReplies, botFields }
  },
}
