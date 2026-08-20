import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
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
} from "@chatbotx.io/database/schema"
import { likeContains } from "@chatbotx.io/database/utils"

const PAGE_SIZE = 100
const ALL_IDS_CAP = 1000

export type SelectableResourceItem = {
  id: string
  name: string
  folderName?: string
}

export type ListSelectableResourcesResult = {
  items: SelectableResourceItem[]
  nextCursor: string | null
  total: number
  allIds?: string[]
}

/**
 * One unified query for the template picker's category tabs, so the picker
 * depends on a single seam rather than each category's own incompatible
 * list-query signature. Search is server-side `ilike` (never client-side
 * `.toLowerCase()`, which is locale-broken for Vietnamese names). Returns
 * `allIds` alongside page 1 whenever `total <= ALL_IDS_CAP`, so a
 * `mode:"all"` -> uncheck-one-row downgrade on the client can be exact
 * instead of guessing at what "all" means.
 */
export const listSelectableResources = async (input: {
  workspaceId: string
  category: TemplateCategory
  keyword?: string | null
  cursor?: string | null
  limit?: number | null
}): Promise<ListSelectableResourcesResult> => {
  const limit = input.limit ?? PAGE_SIZE
  const offset = input.cursor ? Number.parseInt(input.cursor, 10) || 0 : 0

  switch (input.category) {
    case "flows":
      return await listFlows(input.workspaceId, input.keyword, offset, limit)
    case "tags":
      return await listTags(input.workspaceId, input.keyword, offset, limit)
    case "customFields":
      return await listCustomFields(
        input.workspaceId,
        input.keyword,
        offset,
        limit,
      )
    case "products":
      return await listProducts(input.workspaceId, input.keyword, offset, limit)
    case "aiFunctions":
      return await listAIFunctions(
        input.workspaceId,
        input.keyword,
        offset,
        limit,
      )
    case "aiAgents":
      return await listAIAgents(input.workspaceId, input.keyword, offset, limit)
    case "calendars":
      return await listCalendars(
        input.workspaceId,
        input.keyword,
        offset,
        limit,
      )
    case "webchats":
      return await listWebchats(input.workspaceId, input.keyword, offset, limit)
    case "triggers":
      return await listTriggers(input.workspaceId, input.keyword, offset, limit)
    case "fbCommentAutomations":
      return await listFbCommentAutomations(
        input.workspaceId,
        input.keyword,
        offset,
        limit,
      )
    case "keywords":
      return await listKeywords(input.workspaceId, input.keyword, offset, limit)
    case "entryPointLinks":
      return await listEntryPointLinks(
        input.workspaceId,
        input.keyword,
        offset,
        limit,
      )
    case "settings":
      return await listSettings(input.workspaceId, input.keyword, offset, limit)
    default:
      return { items: [], nextCursor: null, total: 0 }
  }
}

const buildAllIds = async (
  offset: number,
  total: number,
  findAllIds: () => Promise<string[]>,
): Promise<string[] | undefined> =>
  offset === 0 && total <= ALL_IDS_CAP ? await findAllIds() : undefined

const listFlows = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.flowModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(flowModel, relationsFilterToSQL(flowModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (await db.query.flowModel.findMany({ where, columns: { id: true } })).map(
      (row) => row.id,
    ),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listTags = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    deletedAt: { isNull: true as const },
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.tagModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(tagModel, relationsFilterToSQL(tagModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (await db.query.tagModel.findMany({ where, columns: { id: true } })).map(
      (row) => row.id,
    ),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listCustomFields = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.customFieldModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(customFieldModel, relationsFilterToSQL(customFieldModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.customFieldModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listProducts = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.productModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(productModel, relationsFilterToSQL(productModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.productModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listAIFunctions = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.aiFunctionModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(aiFunctionModel, relationsFilterToSQL(aiFunctionModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.aiFunctionModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listAIAgents = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.aiAgentModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(aiAgentModel, relationsFilterToSQL(aiAgentModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.aiAgentModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listCalendars = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    deletedAt: { isNull: true as const },
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.appointmentCalendarModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(
      appointmentCalendarModel,
      relationsFilterToSQL(appointmentCalendarModel, where),
    ),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.appointmentCalendarModel.findMany({
        where,
        columns: { id: true },
      })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listWebchats = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.integrationWebchatModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(
      integrationWebchatModel,
      relationsFilterToSQL(integrationWebchatModel, where),
    ),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.integrationWebchatModel.findMany({
        where,
        columns: { id: true },
      })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listTriggers = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.triggerModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(triggerModel, relationsFilterToSQL(triggerModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.triggerModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listFbCommentAutomations = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.fbCommentAutomationModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(
      fbCommentAutomationModel,
      relationsFilterToSQL(fbCommentAutomationModel, where),
    ),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.fbCommentAutomationModel.findMany({
        where,
        columns: { id: true },
      })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

const listEntryPointLinks = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const where = {
    workspaceId,
    name: keyword ? { ilike: likeContains(keyword) } : undefined,
  }

  const [rows, total] = await Promise.all([
    db.query.reflinkModel.findMany({
      where,
      columns: { id: true, name: true },
      limit,
      offset,
      orderBy: { name: "asc" },
    }),
    db.$count(reflinkModel, relationsFilterToSQL(reflinkModel, where)),
  ])

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.reflinkModel.findMany({ where, columns: { id: true } })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: row.name })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

/**
 * `AutomatedResponse` (Keywords) has no `name` column — inbound rows are
 * keyed by their `keywords` array and outbound rows by `text` — so the
 * picker label falls back through `text`, then the joined keyword list.
 * Search is done in the database on `keywords`/`text` directly rather than
 * post-filtering in memory, so pagination stays exact under a search term.
 */
const listKeywords = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  // "keywords" is the inbound half of `AutomatedResponse` — the outbound
  // half backs the unrelated "Page Automated Responses" comment-automation
  // feature, which has no export category of its own. Without this filter,
  // the picker would list a workspace's outbound rows under "Keywords" too.
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
    db.query.automatedResponseModel.findMany({
      where,
      columns: { id: true, text: true, keywords: true },
      limit,
      offset,
      orderBy: { createdAt: "desc" },
    }),
    db.$count(
      automatedResponseModel,
      relationsFilterToSQL(automatedResponseModel, where),
    ),
  ])

  const toLabel = (row: { text: string | null; keywords: string[] }): string =>
    row.text?.trim() || row.keywords.join(", ") || "(untitled)"

  const allIds = await buildAllIds(offset, total, async () =>
    (
      await db.query.automatedResponseModel.findMany({
        where,
        columns: { id: true },
      })
    ).map((row) => row.id),
  )

  return {
    items: rows.map((row) => ({ id: row.id, name: toLabel(row) })),
    nextCursor: offset + rows.length < total ? String(offset + limit) : null,
    total,
    allIds,
  }
}

/**
 * `settings` bundles two tables (`SavedReply`, `BotField`) under one
 * category, mirroring `settingsAdapter`'s two-kind entries. Search and
 * pagination run in memory over the combined, name-sorted list — both
 * tables are small, workspace-admin-configured settings, never large enough
 * to warrant a real cross-table paginated query.
 */
const listSettings = async (
  workspaceId: string,
  keyword: string | null | undefined,
  offset: number,
  limit: number,
): Promise<ListSelectableResourcesResult> => {
  const [savedReplies, botFields] = await Promise.all([
    db.query.savedReplyModel.findMany({
      where: { workspaceId },
      columns: { id: true, shortcut: true },
    }),
    db.query.botFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true },
    }),
  ])

  const all = [
    ...savedReplies.map((row) => ({ id: row.id, name: row.shortcut })),
    ...botFields.map((row) => ({ id: row.id, name: row.name })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const filtered = keyword
    ? all.filter((row) =>
        row.name.toLowerCase().includes(keyword.toLowerCase()),
      )
    : all

  const total = filtered.length
  const page = filtered.slice(offset, offset + limit)

  return {
    items: page,
    nextCursor: offset + page.length < total ? String(offset + limit) : null,
    total,
    allIds:
      offset === 0 && total <= ALL_IDS_CAP
        ? filtered.map((row) => row.id)
        : undefined,
  }
}
