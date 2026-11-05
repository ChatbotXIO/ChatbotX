import type {
  TemplateResourceCategory,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { templateSnapshotRepository } from "@chatbotx.io/database/repositories"
import { templateAdapterRegistry } from "./adapters/registry"
import { collectManifestReferences } from "./manifest-references"
import {
  MAX_PAYLOAD_RESOURCES,
  templatePayloadTooLargeException,
  templateSaveValidationException,
} from "./snapshot-limits"

const resolveTagIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await templateSnapshotRepository.findTags({ workspaceId, ids: uniqueIds })

const resolveCustomFieldIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await templateSnapshotRepository.findCustomFields({
    workspaceId,
    ids: uniqueIds,
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
    return await collector.resolveIds(workspaceId, MAX_PAYLOAD_RESOURCES + 1)
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

export const RESOURCE_CATEGORIES = Object.keys(
  templateAdapterRegistry,
) as TemplateResourceCategory[]

/** How many resources the collectors returned (ids that matched no row ship nothing). */
export const collectedResourceCount = (
  results: Partial<
    Record<TemplateResourceCategory, { entries: readonly unknown[] }>
  >,
): number =>
  Object.values(results).reduce(
    (sum, result) => sum + (result?.entries.length ?? 0),
    0,
  )

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

export type CollectResult = Awaited<
  ReturnType<typeof templateAdapterRegistry.flows.collector.collect>
>
export type CollectedByCategory = Partial<
  Record<TemplateResourceCategory, CollectResult>
>

/** How each manifest-only category checks a picked id and lists "all". */
const MANIFEST_ONLY_SELECTION = {
  tags: {
    findExisting: resolveTagIds,
    listAll: async (workspaceId: string) =>
      await templateSnapshotRepository.findTags({
        workspaceId,
        limit: MAX_PAYLOAD_RESOURCES + 1,
      }),
  },
  customFields: {
    findExisting: resolveCustomFieldIds,
    listAll: async (workspaceId: string) =>
      await templateSnapshotRepository.findCustomFields({
        workspaceId,
        limit: MAX_PAYLOAD_RESOURCES + 1,
      }),
  },
} as const

/** A manifest-only category's selection as owned, deduplicated ids. */
const resolveManifestSelection = async (
  workspaceId: string,
  category: keyof typeof MANIFEST_ONLY_SELECTION,
  selection: TemplateSelection[keyof typeof MANIFEST_ONLY_SELECTION],
): Promise<string[]> => {
  const { findExisting, listAll } = MANIFEST_ONLY_SELECTION[category]
  if (selection?.mode === "all") {
    return (await listAll(workspaceId)).map((row) => row.id)
  }
  if (selection?.mode !== "ids") {
    return []
  }
  await assertIdsBelongToWorkspace(workspaceId, selection.ids, findExisting)
  return [...new Set(selection.ids)]
}

const existingSelectedIds = async (
  workspaceId: string,
  category: string,
  ids: string[],
): Promise<readonly string[]> => {
  if (category === "tags" || category === "customFields") {
    const rows = await MANIFEST_ONLY_SELECTION[category].findExisting(
      workspaceId,
      ids,
    )
    return rows.map((row) => row.id)
  }
  return Object.hasOwn(templateAdapterRegistry, category)
    ? await templateAdapterRegistry[
        category as TemplateResourceCategory
      ].collector.verifyOwnership(workspaceId, ids)
    : ids
}

/**
 * A saved selection without what has been deleted since. A deleted item has no
 * row left to untick in the editor, so kept here it could never be saved again.
 */
export const withoutDeletedResources = async (
  workspaceId: string,
  selection: TemplateSelection,
): Promise<TemplateSelection> => {
  const entries = await Promise.all(
    Object.entries(selection).map(async ([category, chosen]) => {
      if (chosen?.mode !== "ids" || chosen.ids.length === 0) {
        return [category, chosen] as const
      }
      const existing = new Set(
        await existingSelectedIds(workspaceId, category, [
          ...new Set(chosen.ids),
        ]),
      )
      return [
        category,
        {
          ...chosen,
          ids: chosen.ids.filter((id) => existing.has(id)),
          ...(chosen.lockedIds
            ? { lockedIds: chosen.lockedIds.filter((id) => existing.has(id)) }
            : {}),
        },
      ] as const
    }),
  )
  return Object.fromEntries(entries)
}

/**
 * Step 1: every category's selection as concrete, owned ids. Refuses a
 * selection that already exceeds the cap before any collect loads a graph.
 */
export const resolveSnapshotSelection = async (
  workspaceId: string,
  selection: TemplateSelection,
) => {
  const [idsByCategory, selectedTagIds, selectedCustomFieldIds] =
    await Promise.all([
      Promise.all(
        RESOURCE_CATEGORIES.map(
          async (category) =>
            [
              category,
              await resolveCategoryIds(
                workspaceId,
                category,
                selection[category],
              ),
            ] as const,
        ),
      ).then(
        (pairs) =>
          Object.fromEntries(pairs) as Record<
            TemplateResourceCategory,
            string[]
          >,
      ),
      resolveManifestSelection(workspaceId, "tags", selection.tags),
      resolveManifestSelection(
        workspaceId,
        "customFields",
        selection.customFields,
      ),
    ])
  const resolvedIdCount =
    Object.values(idsByCategory).reduce((sum, ids) => sum + ids.length, 0) +
    selectedTagIds.length +
    selectedCustomFieldIds.length
  if (resolvedIdCount > MAX_PAYLOAD_RESOURCES) {
    throw templatePayloadTooLargeException()
  }
  return { idsByCategory, selectedTagIds, selectedCustomFieldIds }
}

/**
 * Step 2: collects every category, folding the hard dependencies each pass
 * reports into `idsByCategory` and re-collecting only the categories that
 * gained ids. Dependencies can loop back (a flow needs a sequence whose step
 * sends another flow, ...), so the number of passes is not bounded by the
 * number of categories; it ends because a pass only adds ids from a finite
 * workspace, and the size check stops a runaway chain as soon as it outgrows
 * what a template may hold.
 */
export const collectSnapshotClosure = async (
  workspaceId: string,
  idsByCategory: Record<TemplateResourceCategory, string[]>,
): Promise<CollectedByCategory> => {
  const results: CollectedByCategory = {}
  let categoriesToCollect = new Set(RESOURCE_CATEGORIES)
  while (categoriesToCollect.size > 0) {
    const collectedThisPass = await Promise.all(
      [...categoriesToCollect].map(
        async (category) =>
          [
            category,
            await templateAdapterRegistry[category].collector.collect(
              workspaceId,
              idsByCategory[category],
            ),
          ] as const,
      ),
    )
    for (const [category, result] of collectedThisPass) {
      results[category] = result
    }
    // A bot field named by ANY collected entry (by slot or by
    // `{{bot_field:<id>}}` token) ships with it, or the copy would keep the
    // source's id. Bot fields are provided by the `settings` category.
    const botFieldDependencies = [
      ...collectManifestReferences(allEntries(results)).botFieldIds,
    ].map((sourceId) => ({ category: "settings" as const, sourceId }))
    categoriesToCollect = foldHardDependencies(idsByCategory, [
      ...collectedThisPass.flatMap(([, result]) => result.hardDependencies),
      ...botFieldDependencies,
    ])
    // Counted by what was actually collected: an id that matched no row ships
    // nothing, and is counted as a dropped reference instead.
    if (collectedResourceCount(results) > MAX_PAYLOAD_RESOURCES) {
      throw templatePayloadTooLargeException()
    }
  }
  return results
}

export const allEntries = (results: CollectedByCategory) =>
  Object.values(results).flatMap((result) => result?.entries ?? [])

export const uniqueOf = <T>(
  results: CollectedByCategory,
  pick: (result: CollectResult) => readonly T[] | undefined,
): T[] => [
  ...new Set(
    Object.values(results).flatMap((result) =>
      result ? (pick(result) ?? []) : [],
    ),
  ),
]
