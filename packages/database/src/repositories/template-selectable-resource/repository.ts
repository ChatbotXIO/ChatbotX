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

export const templateSelectableResourceRepository = {
  async listFlows(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.flowModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(flowModel, relationsFilterToSQL(flowModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (await tx.query.flowModel.findMany({ where, columns: { id: true } })).map(
        (row) => row.id,
      ),
    )

    return { rows, total, allIds }
  },

  async listTags(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      deletedAt: { isNull: true as const },
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.tagModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(tagModel, relationsFilterToSQL(tagModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (await tx.query.tagModel.findMany({ where, columns: { id: true } })).map(
        (row) => row.id,
      ),
    )

    return { rows, total, allIds }
  },

  async listCustomFields(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.customFieldModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(
        customFieldModel,
        relationsFilterToSQL(customFieldModel, where),
      ),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.customFieldModel.findMany({
          where,
          columns: { id: true },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listProducts(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.productModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(productModel, relationsFilterToSQL(productModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.productModel.findMany({ where, columns: { id: true } })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listAIFunctions(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.aiFunctionModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(aiFunctionModel, relationsFilterToSQL(aiFunctionModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.aiFunctionModel.findMany({
          where,
          columns: { id: true },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listAIAgents(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.aiAgentModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(aiAgentModel, relationsFilterToSQL(aiAgentModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.aiAgentModel.findMany({ where, columns: { id: true } })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listCalendars(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      deletedAt: { isNull: true as const },
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.appointmentCalendarModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(
        appointmentCalendarModel,
        relationsFilterToSQL(appointmentCalendarModel, where),
      ),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.appointmentCalendarModel.findMany({
          where,
          columns: { id: true },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listWebchats(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.integrationWebchatModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(
        integrationWebchatModel,
        relationsFilterToSQL(integrationWebchatModel, where),
      ),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.integrationWebchatModel.findMany({
          where,
          columns: { id: true },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listTriggers(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.triggerModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(triggerModel, relationsFilterToSQL(triggerModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.triggerModel.findMany({ where, columns: { id: true } })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listFbCommentAutomations(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.fbCommentAutomationModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
      ),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.fbCommentAutomationModel.findMany({
          where,
          columns: { id: true },
        })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

  async listEntryPointLinks(
    input: CategoryInput,
    tx: DatabaseClient = db,
  ): Promise<ListSelectableResourceRowsResult> {
    const { workspaceId, keyword, offset, limit } = input
    const where = {
      workspaceId,
      name: keyword ? { ilike: likeContains(keyword) } : undefined,
    }

    const [rows, total] = await Promise.all([
      tx.query.reflinkModel.findMany({
        where,
        columns: { id: true, name: true },
        limit,
        offset,
        orderBy: { name: "asc" },
      }),
      tx.$count(reflinkModel, relationsFilterToSQL(reflinkModel, where)),
    ])

    const allIds = await buildAllIds(offset, total, async () =>
      (
        await tx.query.reflinkModel.findMany({ where, columns: { id: true } })
      ).map((row) => row.id),
    )

    return { rows, total, allIds }
  },

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
