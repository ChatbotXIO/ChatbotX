import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { templateSelectableResourceRepository } from "@chatbotx.io/database/repositories"
import {
  assertCanListTemplateCategory,
  type TemplateActor,
} from "./permissions"
import {
  decodeSelectableCursor,
  encodeSelectableCursor,
} from "./selectable-cursor"

const SELECTABLE_RESOURCE_PAGE_SIZE = 100

export type SelectableResourceItem = {
  id: string
  name: string
  folderName?: string
  badge?: string
}

export type ListSelectableResourcesResult = {
  items: SelectableResourceItem[]
  nextCursor: string | null
  total: number
  allIds?: string[]
}

type SelectableRowsResult = {
  rows: SelectableResourceItem[]
  total: number
  allIds?: string[]
  hasMore: boolean
  lastKey?: string
}

type ListSelectableRows = (input: {
  workspaceId: string
  keyword?: string | null
  offset: number
  limit: number
  after?: { key: string; id: string }
}) => Promise<SelectableRowsResult>

/** Manifest-only categories the picker never offers: they are only ever pulled in by what references them. */
type UnpickableCategory = "productCategories"

/**
 * Category -> its repository list. Every pickable category must have an entry
 * (a new one is a compile error until it does); `settings` bundles two tables
 * and is handled separately, and manifest-only categories have nothing to pick
 * and list empty.
 */
const SELECTABLE_LIST_BY_CATEGORY: Record<
  Exclude<TemplateCategory, "settings" | UnpickableCategory>,
  ListSelectableRows
> = {
  flows: (input) => templateSelectableResourceRepository.listFlows(input),
  tags: (input) => templateSelectableResourceRepository.listTags(input),
  customFields: (input) =>
    templateSelectableResourceRepository.listCustomFields(input),
  products: (input) => templateSelectableResourceRepository.listProducts(input),
  aiFunctions: (input) =>
    templateSelectableResourceRepository.listAIFunctions(input),
  aiAgents: (input) => templateSelectableResourceRepository.listAIAgents(input),
  calendars: (input) =>
    templateSelectableResourceRepository.listCalendars(input),
  webchats: (input) => templateSelectableResourceRepository.listWebchats(input),
  triggers: (input) => templateSelectableResourceRepository.listTriggers(input),
  fbCommentAutomations: (input) =>
    templateSelectableResourceRepository.listFbCommentAutomations(input),
  keywords: (input) => templateSelectableResourceRepository.listKeywords(input),
  entryPointLinks: (input) =>
    templateSelectableResourceRepository.listEntryPointLinks(input),
  sequences: (input) =>
    templateSelectableResourceRepository.listSequences(input),
  pipelines: (input) =>
    templateSelectableResourceRepository.listPipelines(input),
  aiMcpServers: (input) =>
    templateSelectableResourceRepository.listAIMcpServers(input),
  aiFiles: (input) => templateSelectableResourceRepository.listAIFiles(input),
  questionnaires: (input) =>
    templateSelectableResourceRepository.listQuestionnaires(input),
  couponTopics: (input) =>
    templateSelectableResourceRepository.listCouponTopics(input),
}

const isPickableCategory = (
  category: TemplateCategory,
): category is keyof typeof SELECTABLE_LIST_BY_CATEGORY =>
  Object.hasOwn(SELECTABLE_LIST_BY_CATEGORY, category)

const projectSelectableResourceRows = (
  result: SelectableRowsResult,
): ListSelectableResourcesResult => {
  const last = result.rows.at(-1)
  return {
    items: result.rows,
    nextCursor:
      result.hasMore && last && result.lastKey !== undefined
        ? encodeSelectableCursor({ key: result.lastKey, id: last.id })
        : null,
    total: result.total,
    allIds: result.allIds,
  }
}

/**
 * One unified query for the template picker's category tabs, so the
 * picker depends on a single seam rather than each category's own
 * incompatible list-query signature. Search is server-side `ilike`
 * (never client-side `.toLowerCase()`, which is locale-broken for
 * Vietnamese names). Returns `allIds` alongside page 1 whenever the total is within the
 * repository cap, so a `mode:"all"` -> uncheck-one-row
 * downgrade on the client can be exact instead of guessing at what "all"
 * means.
 */
export const listSelectableResources = async (input: {
  workspaceId: string
  category: TemplateCategory
  keyword?: string | null
  cursor?: string | null
  limit?: number | null
  actor: TemplateActor
}): Promise<ListSelectableResourcesResult> => {
  assertCanListTemplateCategory(input.actor, input.category)
  const limit = input.limit ?? SELECTABLE_RESOURCE_PAGE_SIZE
  const decoded = decodeSelectableCursor(
    input.cursor,
    // Keywords page by creation time, every other category by name.
    input.category === "keywords" ? "timestamp" : "text",
  )

  const categoryInput = {
    workspaceId: input.workspaceId,
    keyword: input.keyword,
    offset: decoded.kind === "offset" ? decoded.offset : 0,
    limit,
    after: decoded.kind === "after" ? decoded.after : undefined,
  }

  if (input.category === "settings") {
    return projectSelectableResourceRows(
      await templateSelectableResourceRepository.listSettings(categoryInput),
    )
  }
  if (!isPickableCategory(input.category)) {
    return { items: [], nextCursor: null, total: 0 }
  }
  const listRows = SELECTABLE_LIST_BY_CATEGORY[input.category]
  return projectSelectableResourceRows(await listRows(categoryInput))
}
