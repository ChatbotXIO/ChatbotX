import { db } from "@chatbotx.io/database/client"
import type {
  TemplateCategoryCounts,
  TemplateResourceCategory,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { templateCategories } from "@chatbotx.io/database/partials"
import type { CustomFieldModel, TagModel } from "@chatbotx.io/database/types"
import {
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
  type TemplateExport,
  type TemplateFlowEntry,
} from "@chatbotx.io/flow-config"
import { ChatbotXException } from "../errors"
import {
  collectFolderAncestry,
  collectProductCategoryAncestry,
} from "./adapters/manifests/collect-hierarchies"
import { templateAdapterRegistry } from "./adapters/registry"

const MAX_PAYLOAD_RESOURCES = 200
// `payload` is a jsonb column, not S3 — a row-count cap alone doesn't bound
// bytes (e.g. 200 large flow graphs), so this is a second, independent gate.
const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

export const templateSaveValidationException = () =>
  new ChatbotXException(
    "One or more selected resources could not be found in this workspace",
    "templateSaveInvalidSelection",
  )

export const templatePayloadTooLargeException = () =>
  new ChatbotXException(
    "This template selection is too large to save",
    "templatePayloadTooLarge",
  )

export const templatePayloadTooManyBytesException = () =>
  new ChatbotXException(
    "This template's data is too large to save",
    "templatePayloadTooManyBytes",
  )

const resolveTagIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await db.query.tagModel.findMany({
    where: {
      workspaceId,
      deletedAt: { isNull: true as const },
      id: { in: uniqueIds },
    },
    columns: { id: true },
  })

const resolveCustomFieldIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await db.query.customFieldModel.findMany({
    where: { workspaceId, id: { in: uniqueIds } },
    columns: { id: true },
  })

/**
 * Deduplicates then verifies every id belongs to `workspaceId`. Modeled on
 * `ensureAllFlowIdsExists` (`apps/builder/src/features/flows/queries/
 * index.ts`), including its count-vs-length comparison — hence the mandatory
 * dedupe first, since that comparison throws a false negative on duplicate
 * ids. Used for the two manifest-only categories that still have their own
 * ownership check inline (`tags`, `customFields`) — every resource category
 * instead goes through its adapter's `collector.verifyOwnership`.
 */
const assertIdsBelongToWorkspace = async (
  workspaceId: string,
  ids: readonly string[],
  findExisting: (
    workspaceId: string,
    uniqueIds: string[],
  ) => Promise<{ id: string }[]>,
): Promise<void> => {
  const uniqueIds = [...new Set(ids)]
  if (uniqueIds.length === 0) {
    return
  }
  const rows = await findExisting(workspaceId, uniqueIds)
  if (rows.length !== uniqueIds.length) {
    throw templateSaveValidationException()
  }
}

const buildTagManifestEntries = (
  tags: Pick<TagModel, "id" | "name">[],
): Record<string, { name: string }> =>
  Object.fromEntries(tags.map((tag) => [tag.id, { name: tag.name }]))

const buildCustomFieldManifestEntries = (
  fields: Pick<CustomFieldModel, "id" | "name" | "type">[],
): Record<string, { name: string; type: CustomFieldModel["type"] }> =>
  Object.fromEntries(
    fields.map((field) => [field.id, { name: field.name, type: field.type }]),
  )

/**
 * Resolves one resource category's selection to a concrete id list —
 * `mode:"ids"` is deduped and ownership-checked against the adapter's own
 * `verifyOwnership` (structurally required per `ResourceAdapter`, so a new
 * category cannot skip this the way the old switch-statement resolver
 * could); `mode:"all"` calls the adapter's own `resolveIds`.
 */
const resolveCategoryIds = async (
  workspaceId: string,
  category: TemplateResourceCategory,
  selection: { mode: "all" } | { mode: "ids"; ids: string[] } | undefined,
): Promise<string[]> => {
  if (!selection) {
    return []
  }
  const collector = templateAdapterRegistry[category].collector
  if (selection.mode === "all") {
    return await collector.resolveIds(workspaceId)
  }
  const uniqueIds = [...new Set(selection.ids)]
  if (uniqueIds.length === 0) {
    return []
  }
  const verified = await collector.verifyOwnership(workspaceId, uniqueIds)
  if (verified.length !== uniqueIds.length) {
    throw templateSaveValidationException()
  }
  return verified
}

type BuildSnapshotInput = {
  workspaceId: string
  tenantId: string
  selection: TemplateSelection
}

type BuildSnapshotResult = {
  payload: TemplateExport
  categoryCounts: TemplateCategoryCounts
}

const RESOURCE_CATEGORIES = Object.keys(
  templateAdapterRegistry,
) as TemplateResourceCategory[]

/**
 * Folds each collected category's reported `hardDependencies` into the
 * running id-set map, so a category that must include another (e.g. an
 * entryPointLink's NOT NULL `flowId`) is auto-selected even when the export
 * UI never explicitly checked it — resolved by construction, not by the
 * install-time adapter degrading to warn+skip (see G9 in the gap-closure
 * plan). Mutates `idsByCategory` in place and returns the set of categories
 * that gained at least one new id, so the caller knows which categories need
 * re-collecting.
 */
const foldHardDependencies = (
  idsByCategory: Record<TemplateResourceCategory, string[]>,
  hardDependencies: readonly {
    category: TemplateResourceCategory
    sourceId: string
  }[],
): Set<TemplateResourceCategory> => {
  const changed = new Set<TemplateResourceCategory>()
  for (const dependency of hardDependencies) {
    const existing = idsByCategory[dependency.category]
    if (!existing.includes(dependency.sourceId)) {
      existing.push(dependency.sourceId)
      changed.add(dependency.category)
    }
  }
  return changed
}

/**
 * Resolves a selection to a concrete, validated snapshot envelope:
 * 1. Resolve every resource category's selection to a concrete id list via
 *    its own adapter (`mode:"all"` expansion + `mode:"ids"` ownership check).
 * 2. Collect every category via its adapter's `collect`, then fold any
 *    reported hard dependencies into the relevant categories' id sets and
 *    re-collect only the categories that gained ids — bounded by the number
 *    of resource categories, since each pass only ever adds ids already
 *    known to exist in the workspace.
 * 3. Merge every category's folder/productCategory references into the two
 *    hierarchical manifests, plus the manifest-only categories
 *    (`tags`/`customFields`).
 * 4. Validate the assembled envelope with `parseTemplateExport` before the
 *    caller persists it.
 *
 * Caps total resource count at `MAX_PAYLOAD_RESOURCES` — the payload lives
 * in a jsonb column rather than S3, so this is the only guard against an
 * unbounded template.
 */
export const buildTemplateSnapshot = async (
  input: BuildSnapshotInput,
): Promise<BuildSnapshotResult> => {
  const { workspaceId, tenantId, selection } = input

  // Step 1: resolve every resource category's selection to a concrete id list.
  const idsByCategory = Object.fromEntries(
    await Promise.all(
      RESOURCE_CATEGORIES.map(async (category) => [
        category,
        await resolveCategoryIds(workspaceId, category, selection[category]),
      ]),
    ),
  ) as Record<TemplateResourceCategory, string[]>

  // Manifest-only categories keep their own inline ownership check — they
  // never had a `mode:"all"` resolver issue (G1) since they were already
  // wired before this refactor.
  const tagSelection = selection.tags
  if (tagSelection?.mode === "ids") {
    await assertIdsBelongToWorkspace(
      workspaceId,
      tagSelection.ids,
      resolveTagIds,
    )
  }
  const customFieldSelection = selection.customFields
  if (customFieldSelection?.mode === "ids") {
    await assertIdsBelongToWorkspace(
      workspaceId,
      customFieldSelection.ids,
      resolveCustomFieldIds,
    )
  }
  const tagIds =
    tagSelection?.mode === "all"
      ? (
          await db.query.tagModel.findMany({
            where: { workspaceId, deletedAt: { isNull: true as const } },
            columns: { id: true },
          })
        ).map((row) => row.id)
      : [...new Set(tagSelection?.mode === "ids" ? tagSelection.ids : [])]
  const customFieldIds =
    customFieldSelection?.mode === "all"
      ? (
          await db.query.customFieldModel.findMany({
            where: { workspaceId },
            columns: { id: true },
          })
        ).map((row) => row.id)
      : [
          ...new Set(
            customFieldSelection?.mode === "ids"
              ? customFieldSelection.ids
              : [],
          ),
        ]

  // Step 2: collect every category, folding hard dependencies until a pass
  // adds nothing new. Bounded by RESOURCE_CATEGORIES.length — each pass can
  // only add ids for categories that exist, so it terminates.
  const resultsByCategory: Partial<
    Record<
      TemplateResourceCategory,
      Awaited<
        ReturnType<typeof templateAdapterRegistry.flows.collector.collect>
      >
    >
  > = {}
  let categoriesToCollect = new Set(RESOURCE_CATEGORIES)
  for (
    let pass = 0;
    pass < RESOURCE_CATEGORIES.length && categoriesToCollect.size > 0;
    pass++
  ) {
    const collectedThisPass = await Promise.all(
      [...categoriesToCollect].map(async (category) => {
        const collector = templateAdapterRegistry[category].collector
        const result = await collector.collect(
          workspaceId,
          idsByCategory[category],
        )
        return [category, result] as const
      }),
    )
    const allHardDependencies = collectedThisPass.flatMap(
      ([, result]) => result.hardDependencies,
    )
    for (const [category, result] of collectedThisPass) {
      resultsByCategory[category] = result
    }
    categoriesToCollect = foldHardDependencies(
      idsByCategory,
      allHardDependencies,
    )
  }

  const totalResources =
    Object.values(idsByCategory).reduce((sum, ids) => sum + ids.length, 0) +
    tagIds.length +
    customFieldIds.length
  if (totalResources > MAX_PAYLOAD_RESOURCES) {
    throw templatePayloadTooLargeException()
  }

  // Step 3: assemble manifests. Every category's referenced folder/
  // productCategory ids are merged (deduped by the shared manifest object)
  // before either ancestry walk runs.
  const allFolderIds = [
    ...new Set(
      Object.values(resultsByCategory).flatMap(
        (result) => result?.folderIds ?? [],
      ),
    ),
  ]
  const allProductCategoryIds = [
    ...new Set(
      Object.values(resultsByCategory).flatMap(
        (result) => result?.productCategoryIds ?? [],
      ),
    ),
  ]
  const [folderManifest, productCategoryManifest, tagRows, customFieldRows] =
    await Promise.all([
      collectFolderAncestry(workspaceId, allFolderIds),
      collectProductCategoryAncestry(workspaceId, allProductCategoryIds),
      tagIds.length > 0
        ? db.query.tagModel.findMany({
            where: { workspaceId, id: { in: tagIds } },
            columns: { id: true, name: true },
          })
        : Promise.resolve([]),
      customFieldIds.length > 0
        ? db.query.customFieldModel.findMany({
            where: { workspaceId, id: { in: customFieldIds } },
            columns: { id: true, name: true, type: true },
          })
        : Promise.resolve([]),
    ])

  const payload: TemplateExport = {
    formatVersion: TEMPLATE_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { workspaceId, tenantId },
    manifests: {
      customFields: buildCustomFieldManifestEntries(customFieldRows),
      tags: buildTagManifestEntries(tagRows),
      productCategories: productCategoryManifest,
      folders: folderManifest,
    },
    resources: {
      // `flows` alone has a strict entry shape (`TemplateFlowEntry`) rather
      // than the loose `{sourceId} & Record<string, unknown>` every other
      // category uses — `flowsAdapter.collect` already builds exactly that
      // shape (mirroring `flowsAdapter.insert`'s own expectations), so this
      // is a type-level assertion of an invariant `parseTemplateExport`
      // re-validates immediately below, not an unchecked cast.
      flows: (resultsByCategory.flows?.entries ??
        []) as unknown as TemplateFlowEntry[],
      products: resultsByCategory.products?.entries ?? [],
      aiFunctions: resultsByCategory.aiFunctions?.entries ?? [],
      aiAgents: resultsByCategory.aiAgents?.entries ?? [],
      calendars: resultsByCategory.calendars?.entries ?? [],
      webchats: resultsByCategory.webchats?.entries ?? [],
      keywords: resultsByCategory.keywords?.entries ?? [],
      entryPointLinks: resultsByCategory.entryPointLinks?.entries ?? [],
      triggers: resultsByCategory.triggers?.entries ?? [],
      fbCommentAutomations:
        resultsByCategory.fbCommentAutomations?.entries ?? [],
      settings: {
        savedReplies:
          resultsByCategory.settings?.entries.filter(
            (entry) => entry.kind === "savedReply",
          ) ?? [],
        botFields:
          resultsByCategory.settings?.entries.filter(
            (entry) => entry.kind === "botField",
          ) ?? [],
      },
    },
  }

  const parsed = parseTemplateExport(payload)
  if (!parsed.ok) {
    throw new ChatbotXException(
      `Template snapshot failed validation: ${parsed.reason}`,
      "templateSnapshotInvalid",
    )
  }

  const payloadBytes = Buffer.byteLength(JSON.stringify(parsed.data), "utf8")
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    throw templatePayloadTooManyBytesException()
  }

  const countByCategory: Partial<Record<string, number>> = {
    tags: tagRows.length,
    customFields: customFieldRows.length,
    ...Object.fromEntries(
      RESOURCE_CATEGORIES.map((category) => [
        category,
        resultsByCategory[category]?.entries.length ?? 0,
      ]),
    ),
  }
  const categoryCounts = Object.fromEntries(
    templateCategories.options.map((category) => [
      category,
      countByCategory[category] ?? 0,
    ]),
  ) as TemplateCategoryCounts

  return { payload: parsed.data, categoryCounts }
}
