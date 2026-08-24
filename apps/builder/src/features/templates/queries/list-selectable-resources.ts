import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
import {
  customFieldModel,
  flowModel,
  tagModel,
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
 *
 * Only `flows`/`tags`/`customFields` are wired so far — every other
 * category returns an empty page rather than throwing, so the picker UI
 * can ship incrementally as each category's snapshot collector lands.
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
