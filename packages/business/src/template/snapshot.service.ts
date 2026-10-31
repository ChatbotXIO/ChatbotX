import { db } from "@chatbotx.io/database/client"
import type {
  TemplateCategoryCounts,
  TemplateResourceCategory,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { inboxRepository } from "@chatbotx.io/database/repositories"
import type { CustomFieldModel, TagModel } from "@chatbotx.io/database/types"
import {
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
  TEMPLATE_EXPORT_FORMAT_VERSION_V2,
  type TemplateExport,
} from "@chatbotx.io/flow-config"
import { isNumericId } from "@chatbotx.io/utils/id"
import { ChatbotXException } from "../errors"
import {
  collectFolderAncestry,
  collectProductCategoryAncestry,
} from "./adapters/manifests/collect-hierarchies"
import { collectPipelineManifest } from "./adapters/manifests/collect-pipelines"
import { templateAdapterRegistry } from "./adapters/registry"
import {
  buildPayloadResources,
  categoriesRequiringV2,
} from "./adapters/registry-derived"
import { categoryCountsOfPayload } from "./category-counts"
import { countDroppedResourceReferences } from "./dropped-references"
import { buildItemPermissions } from "./item-permissions"
import { collectManifestReferences } from "./manifest-references"
import {
  countRowsWithUnshippedReferences,
  type TriggerConditionRow,
} from "./trigger-conditions"

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

/**
 * The tag and custom-field ids referenced by `entries` — by id slot or by
 * `{{name}}` token — that exist in this workspace. A token name shared by two
 * fields of different types cannot be attributed to either, so it is skipped
 * (the install leaves such a token as written and warns).
 */
const resolveReferencedManifestIds = async (
  workspaceId: string,
  entries: readonly unknown[],
): Promise<{ tagIds: string[]; customFieldIds: string[] }> => {
  const references = collectManifestReferences(entries)
  const namedFields =
    references.customFieldNames.size > 0
      ? await db.query.customFieldModel.findMany({
          where: {
            workspaceId,
            name: { in: [...references.customFieldNames] },
          },
          columns: { id: true, name: true },
        })
      : []
  const idsByName = Map.groupBy(namedFields, (field) => field.name)
  const unambiguousIds = [...idsByName.values()]
    .filter((fields) => fields.length === 1)
    .map(([field]) => field.id)
  return {
    tagIds: [...references.tagIds].filter(isNumericId),
    customFieldIds: [...references.customFieldIds, ...unambiguousIds],
  }
}

type BuildSnapshotInput = {
  workspaceId: string
  tenantId: string
  selection: TemplateSelection
}

type BuildSnapshotResult = {
  payload: TemplateExport
  categoryCounts: TemplateCategoryCounts
  /**
   * References the install will drop: tags and custom fields an included
   * resource still names but that no longer exist in the workspace, plus
   * trigger condition rows naming something the template does not carry (a
   * product that was not selected, a deleted pipeline, ...). The install
   * reports them as `referenceRemoved`. The editor shows the count.
   */
  droppedReferenceCount: number
}

const RESOURCE_CATEGORIES = Object.keys(
  templateAdapterRegistry,
) as TemplateResourceCategory[]

/** How many resources the collectors returned (ids that matched no row ship nothing). */
const collectedResourceCount = (
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

/**
 * The `inboxes` manifest: identity (channel and name) of each source inbox an
 * included resource is scoped to. Only inboxes the workspace owns are listed,
 * so a stale or foreign id never reaches the payload.
 */
const buildInboxManifest = async (
  workspaceId: string,
  inboxIds: readonly string[],
): Promise<Record<string, { channelType: string; name: string }>> => {
  const rows = await inboxRepository.listIdentitiesByIds({
    workspaceId,
    ids: [...new Set(inboxIds)],
  })
  return Object.fromEntries(
    rows.map((row) => [row.id, { channelType: row.channel, name: row.name }]),
  )
}

/**
 * Resolves a selection to a concrete, validated snapshot envelope:
 * 1. Resolve every resource category's selection to a concrete id list via
 *    its own adapter (`mode:"all"` expansion + `mode:"ids"` ownership check).
 * 2. Collect every category via its adapter's `collect`, then fold any
 *    reported hard dependencies into the relevant categories' id sets and
 *    re-collect only the categories that gained ids, until a pass adds
 *    nothing (dependencies can loop back, so the number of passes is not
 *    bounded by the number of categories; the resource cap ends a runaway).
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
  const selectedTagIds =
    tagSelection?.mode === "all"
      ? (
          await db.query.tagModel.findMany({
            where: { workspaceId, deletedAt: { isNull: true as const } },
            columns: { id: true },
            limit: MAX_PAYLOAD_RESOURCES + 1,
          })
        ).map((row) => row.id)
      : [...new Set(tagSelection?.mode === "ids" ? tagSelection.ids : [])]
  const selectedCustomFieldIds =
    customFieldSelection?.mode === "all"
      ? (
          await db.query.customFieldModel.findMany({
            where: { workspaceId },
            columns: { id: true },
            limit: MAX_PAYLOAD_RESOURCES + 1,
          })
        ).map((row) => row.id)
      : [
          ...new Set(
            customFieldSelection?.mode === "ids"
              ? customFieldSelection.ids
              : [],
          ),
        ]

  // The resolved id counts alone can already exceed the cap: refuse before the
  // first collect loads every graph into memory.
  const resolvedIdCount =
    Object.values(idsByCategory).reduce((sum, ids) => sum + ids.length, 0) +
    selectedTagIds.length +
    selectedCustomFieldIds.length
  if (resolvedIdCount > MAX_PAYLOAD_RESOURCES) {
    throw templatePayloadTooLargeException()
  }

  // Step 2: collect every category, folding hard dependencies until a pass
  // adds nothing new.
  const resultsByCategory: Partial<
    Record<
      TemplateResourceCategory,
      Awaited<
        ReturnType<typeof templateAdapterRegistry.flows.collector.collect>
      >
    >
  > = {}
  let categoriesToCollect = new Set(RESOURCE_CATEGORIES)
  // Until a pass adds nothing new. Dependencies can loop back (a flow needs a
  // sequence whose step sends another flow, ...), so the number of passes is
  // not bounded by the number of categories; it ends because a pass only adds
  // ids from a finite workspace, and the size check below stops a runaway
  // chain as soon as it outgrows what a template may hold.
  while (categoriesToCollect.size > 0) {
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
    for (const [category, result] of collectedThisPass) {
      resultsByCategory[category] = result
    }
    // A bot field named by ANY collected entry (a flow, a trigger action, a
    // keyword reply, an AI prompt, ...) ships with it - by slot or by
    // `{{bot_field:<id>}}` token - or the copy would keep the source's id.
    // Bot fields are provided by the `settings` category.
    const botFieldDependencies = [
      ...collectManifestReferences(
        Object.values(resultsByCategory).flatMap(
          (result) => result?.entries ?? [],
        ),
      ).botFieldIds,
    ].map((sourceId) => ({ category: "settings" as const, sourceId }))
    const allHardDependencies = [
      ...collectedThisPass.flatMap(([, result]) => result.hardDependencies),
      ...botFieldDependencies,
    ]
    categoriesToCollect = foldHardDependencies(
      idsByCategory,
      allHardDependencies,
    )
    // Counted by what was actually collected: an id a token or slot named that
    // no longer exists (or was never this workspace's) ships nothing, and is
    // counted as a dropped reference instead.
    if (collectedResourceCount(resultsByCategory) > MAX_PAYLOAD_RESOURCES) {
      throw templatePayloadTooLargeException()
    }
  }

  // Tags and custom fields an included resource uses are shipped even when
  // their own category was not selected (the install would otherwise leave a
  // foreign id in the copied flow). Ownership is enforced by the row queries
  // below, which only return this workspace's live rows.
  const referenced = await resolveReferencedManifestIds(
    workspaceId,
    Object.values(resultsByCategory).flatMap((result) => result?.entries ?? []),
  )
  const tagIds = [...new Set([...selectedTagIds, ...referenced.tagIds])]
  const customFieldIds = [
    ...new Set([...selectedCustomFieldIds, ...referenced.customFieldIds]),
  ]

  const totalResources =
    collectedResourceCount(resultsByCategory) +
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
            where: {
              workspaceId,
              id: { in: tagIds },
              deletedAt: { isNull: true as const },
            },
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

  const foundTagIds = new Set(tagRows.map((row) => row.id))
  const foundCustomFieldIds = new Set(customFieldRows.map((row) => row.id))
  const droppedManifestReferences =
    new Set(referenced.tagIds.filter((id) => !foundTagIds.has(id))).size +
    new Set(
      referenced.customFieldIds.filter((id) => !foundCustomFieldIds.has(id)),
    ).size

  const triggerConditions = (resultsByCategory.triggers?.entries ?? []).flatMap(
    (entry) => (entry.conditions ?? []) as TriggerConditionRow[],
  )
  // The pipeline scan reads only each flow's graph arrays.
  const flowGraphs = (resultsByCategory.flows?.entries ?? []).map((entry) => ({
    nodes: Array.isArray(entry.nodes) ? entry.nodes : [],
    edges: Array.isArray(entry.edges) ? entry.edges : [],
  }))
  const pipelineManifest = await collectPipelineManifest(
    workspaceId,
    flowGraphs,
    triggerConditions,
  )
  const sourceIdsOf = (category: TemplateResourceCategory) =>
    new Set(
      (resultsByCategory[category]?.entries ?? []).map(
        (entry) => entry.sourceId,
      ),
    )
  // A condition row naming something the template does not carry is dropped
  // by the install (and its trigger switched off), so it counts as dropped.
  // Tags and custom fields are left out here: the manifest count above
  // already includes the ones condition rows name.
  const droppedConditionRows = countRowsWithUnshippedReferences(
    triggerConditions,
    {
      sequence: sourceIdsOf("sequences"),
      product: sourceIdsOf("products"),
      productCategory: new Set(Object.keys(productCategoryManifest)),
      pipeline: new Set(Object.keys(pipelineManifest)),
      pipelineStage: new Set(
        Object.values(pipelineManifest).flatMap((pipeline) =>
          (pipeline.stages ?? []).map((stage) => stage.sourceId),
        ),
      ),
    },
  )

  // Everything else an included resource names that the payload does not
  // carry (a pipeline deleted since the flow was written, a flow that no longer
  // exists): the install removes each, so the editor counts them too.
  const droppedResourceReferences = countDroppedResourceReferences(
    Object.values(resultsByCategory).flatMap((result) =>
      (result?.entries ?? []).map((entry) =>
        "conditions" in entry ? { ...entry, conditions: undefined } : entry,
      ),
    ),
    {
      flow: sourceIdsOf("flows"),
      trigger: sourceIdsOf("triggers"),
      sequence: sourceIdsOf("sequences"),
      aiAgent: sourceIdsOf("aiAgents"),
      aiFunction: sourceIdsOf("aiFunctions"),
      aiFile: sourceIdsOf("aiFiles"),
      aiMcpServer: sourceIdsOf("aiMcpServers"),
      calendar: sourceIdsOf("calendars"),
      questionnaire: sourceIdsOf("questionnaires"),
      couponTopic: sourceIdsOf("couponTopics"),
      pipeline: new Set(Object.keys(pipelineManifest)),
      pipelineStage: new Set(
        Object.values(pipelineManifest).flatMap((pipeline) =>
          (pipeline.stages ?? []).map((stage) => stage.sourceId),
        ),
      ),
      pipelineField: new Set(
        Object.values(pipelineManifest).flatMap((pipeline) =>
          (pipeline.fields ?? []).map((field) => field.sourceId),
        ),
      ),
      productCategory: new Set(Object.keys(productCategoryManifest)),
      botField: sourceIdsOf("settings"),
    },
  )

  const itemPermissions = buildItemPermissions(selection, {
    ...Object.fromEntries(
      RESOURCE_CATEGORIES.map((category) => [
        category,
        (resultsByCategory[category]?.entries ?? []).map(
          (entry) => entry.sourceId,
        ),
      ]),
    ),
    tags: tagRows.map((row) => row.id),
    customFields: customFieldRows.map((row) => row.id),
    productCategories: Object.keys(productCategoryManifest),
  })
  const hasItemPermissions = Object.keys(itemPermissions).length > 0
  const inboxManifest = await buildInboxManifest(
    workspaceId,
    Object.values(resultsByCategory).flatMap(
      (result) => result?.inboxIds ?? [],
    ),
  )
  // A payload that names inboxes is v2: an older worker must refuse it
  // rather than install automations it cannot bind to an inbox.
  const needsV2 =
    hasItemPermissions ||
    Object.keys(inboxManifest).length > 0 ||
    // A category an older worker does not know would be dropped on its parse.
    categoriesRequiringV2(templateAdapterRegistry).some(
      (category) => (resultsByCategory[category]?.entries.length ?? 0) > 0,
    )

  const payload = {
    formatVersion: needsV2
      ? TEMPLATE_EXPORT_FORMAT_VERSION_V2
      : TEMPLATE_EXPORT_FORMAT_VERSION,
    ...(hasItemPermissions ? { permissions: itemPermissions } : {}),
    exportedAt: new Date().toISOString(),
    source: { workspaceId, tenantId },
    manifests: {
      customFields: buildCustomFieldManifestEntries(customFieldRows),
      tags: buildTagManifestEntries(tagRows),
      productCategories: productCategoryManifest,
      folders: folderManifest,
      pipelines: pipelineManifest,
      inboxes: inboxManifest,
    },
    resources: buildPayloadResources(resultsByCategory),
  }

  const parsed = parseTemplateExport(payload)
  if (!parsed.ok) {
    throw new ChatbotXException(
      `Template snapshot failed validation: ${parsed.reason}`,
      "templateSnapshotInvalid",
    )
  }

  const payloadBytes = new TextEncoder().encode(
    JSON.stringify(parsed.data),
  ).byteLength
  if (payloadBytes > MAX_PAYLOAD_BYTES) {
    throw templatePayloadTooManyBytesException()
  }

  const categoryCounts = categoryCountsOfPayload(parsed.data)

  return {
    payload: parsed.data,
    categoryCounts,
    droppedReferenceCount:
      droppedManifestReferences +
      droppedConditionRows +
      droppedResourceReferences,
  }
}
