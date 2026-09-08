import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { templateSelectableResourceRepository } from "@chatbotx.io/database/repositories"

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

  const categoryInput = {
    workspaceId: input.workspaceId,
    keyword: input.keyword,
    offset,
    limit,
  }

  switch (input.category) {
    case "flows":
      return projectRows(
        await templateSelectableResourceRepository.listFlows(categoryInput),
        offset,
        limit,
      )
    case "tags":
      return projectRows(
        await templateSelectableResourceRepository.listTags(categoryInput),
        offset,
        limit,
      )
    case "customFields":
      return projectRows(
        await templateSelectableResourceRepository.listCustomFields(
          categoryInput,
        ),
        offset,
        limit,
      )
    case "products":
      return projectRows(
        await templateSelectableResourceRepository.listProducts(categoryInput),
        offset,
        limit,
      )
    case "aiFunctions":
      return projectRows(
        await templateSelectableResourceRepository.listAIFunctions(
          categoryInput,
        ),
        offset,
        limit,
      )
    case "aiAgents":
      return projectRows(
        await templateSelectableResourceRepository.listAIAgents(categoryInput),
        offset,
        limit,
      )
    case "calendars":
      return projectRows(
        await templateSelectableResourceRepository.listCalendars(categoryInput),
        offset,
        limit,
      )
    case "webchats":
      return projectRows(
        await templateSelectableResourceRepository.listWebchats(categoryInput),
        offset,
        limit,
      )
    case "triggers":
      return projectRows(
        await templateSelectableResourceRepository.listTriggers(categoryInput),
        offset,
        limit,
      )
    case "fbCommentAutomations":
      return projectRows(
        await templateSelectableResourceRepository.listFbCommentAutomations(
          categoryInput,
        ),
        offset,
        limit,
      )
    case "keywords":
      return projectRows(
        await templateSelectableResourceRepository.listKeywords(categoryInput),
        offset,
        limit,
      )
    case "entryPointLinks":
      return projectRows(
        await templateSelectableResourceRepository.listEntryPointLinks(
          categoryInput,
        ),
        offset,
        limit,
      )
    case "settings":
      return listSettings(input.workspaceId, input.keyword, offset, limit)
    default:
      return { items: [], nextCursor: null, total: 0 }
  }
}

const projectRows = (
  result: { rows: SelectableResourceItem[]; total: number; allIds?: string[] },
  offset: number,
  limit: number,
): ListSelectableResourcesResult => ({
  items: result.rows,
  nextCursor:
    offset + result.rows.length < result.total ? String(offset + limit) : null,
  total: result.total,
  allIds: result.allIds,
})

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
  const { savedReplies, botFields } =
    await templateSelectableResourceRepository.listSettings(workspaceId)

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
