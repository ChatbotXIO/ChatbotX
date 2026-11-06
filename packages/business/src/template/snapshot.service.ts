import type {
  TemplateCategory,
  TemplateCategoryCounts,
  TemplateResourceCategory,
  TemplateResourceKind,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import {
  inboxRepository,
  templateSnapshotRepository,
} from "@chatbotx.io/database/repositories"
import type { CustomFieldModel, TagModel } from "@chatbotx.io/database/types"
import {
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
  TEMPLATE_EXPORT_FORMAT_VERSION_V2,
  type TemplateCustomFieldManifestEntry,
  type TemplateExport,
  type TemplateTagManifestEntry,
} from "@chatbotx.io/flow-config"
import { isNumericId } from "@chatbotx.io/utils/id"
import { ChatbotXException } from "../errors"
import {
  collectFolderAncestry,
  collectProductCategoryAncestry,
} from "./adapters/manifests/collect-hierarchies"
import { collectPipelineManifest } from "./adapters/manifests/collect-pipelines"
import { collectPlaceCategoryManifest } from "./adapters/manifests/collect-place-categories"
import { templateAdapterRegistry } from "./adapters/registry"
import {
  buildPayloadResources,
  categoriesRequiringV2,
} from "./adapters/registry-derived"
import { categoryCountsOfPayload } from "./category-counts"
import { listLockedIds } from "./installed-resource.service"
import { buildItemPermissions } from "./item-permissions"
import { collectManifestReferences } from "./manifest-references"
import {
  allEntries,
  type CollectedByCategory,
  collectedResourceCount,
  collectSnapshotClosure,
  RESOURCE_CATEGORIES,
  resolveSnapshotSelection,
  uniqueOf,
} from "./snapshot-collect"
import { countDroppedReferences } from "./snapshot-dropped"
import {
  MAX_PAYLOAD_BYTES,
  MAX_PAYLOAD_RESOURCES,
  templatePayloadTooLargeException,
  templatePayloadTooManyBytesException,
} from "./snapshot-limits"
import type { TriggerConditionRow } from "./trigger-conditions"

export {
  templatePayloadTooLargeException,
  templatePayloadTooManyBytesException,
  templateSaveValidationException,
} from "./snapshot-limits"

/** The kind each category's copies are tracked under; settings ships saved replies (its bot fields are name-and-type only). */
export const viewOnlyCheckKinds = (
  category: TemplateCategory,
): TemplateResourceKind[] => {
  // Manifest categories (tags, custom fields, ...) ship names, not content.
  if (!Object.hasOwn(templateAdapterRegistry, category)) {
    return []
  }
  const tracked =
    templateAdapterRegistry[category as TemplateResourceCategory].trackedKind
  if (tracked) {
    return [tracked]
  }
  // Settings carries two kinds; a View-only bot field is as locked as a reply.
  return category === "settings" ? ["savedReply", "botField"] : []
}

export const templateIncludesViewOnlyCopyException = () =>
  new ChatbotXException(
    "A copy installed from a view-only template can not be included in a new template",
    "templateIncludesViewOnlyCopy",
    403,
  )

/**
 * Re-publishing a View-only copy (directly or as a dependency of something
 * selected) would hand its content out editable, the same bypass duplicate
 * and export refuse. One indexed query per non-empty category.
 */
const assertNoViewOnlyCopies = async (
  workspaceId: string,
  idsByCategory: Record<TemplateResourceCategory, string[]>,
): Promise<void> => {
  for (const [category, ids] of Object.entries(idsByCategory) as [
    TemplateResourceCategory,
    string[],
  ][]) {
    if (ids.length === 0) {
      continue
    }
    for (const resourceKind of viewOnlyCheckKinds(category)) {
      const locked = await listLockedIds({
        workspaceId,
        resourceKind,
        resourceIds: ids,
      })
      if (locked.length > 0) {
        throw templateIncludesViewOnlyCopyException()
      }
    }
  }
}

/** Left out at the root, so a template with no folders keeps its fingerprint. */
const folderRefOf = (row: { folderId: string | null }) =>
  row.folderId ? { folderSourceId: row.folderId } : {}

const buildTagManifestEntries = (
  tags: Pick<TagModel, "id" | "name" | "folderId">[],
): Record<string, TemplateTagManifestEntry> =>
  Object.fromEntries(
    tags.map((tag) => [tag.id, { name: tag.name, ...folderRefOf(tag) }]),
  )

const buildCustomFieldManifestEntries = (
  fields: Pick<CustomFieldModel, "id" | "name" | "type" | "folderId">[],
): Record<string, TemplateCustomFieldManifestEntry> =>
  Object.fromEntries(
    fields.map((field) => [
      field.id,
      { name: field.name, type: field.type, ...folderRefOf(field) },
    ]),
  )

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
  const namedFields = await templateSnapshotRepository.findCustomFields({
    workspaceId,
    names: [...references.customFieldNames],
  })
  const idsByName = Map.groupBy(namedFields, (field) => field.name)
  const unambiguousIds = [...idsByName.values()]
    .filter((fields) => fields.length === 1)
    .map(([field]) => field.id)
  // Add/Remove Contact Tag steps store names: ship those tags so the target
  // has them from the install on.
  const namedTags = await templateSnapshotRepository.findTags({
    workspaceId,
    names: [...references.tagNames],
  })
  return {
    tagIds: [
      ...new Set([
        ...[...references.tagIds].filter(isNumericId),
        ...namedTags.map((tag) => tag.id),
      ]),
    ],
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
 * Step 5: the envelope's format version (v2 when it carries anything an older
 * worker must refuse rather than drop), validation and the byte cap.
 */
const finalizeSnapshotPayload = (
  payload: Omit<TemplateExport, "formatVersion">,
  results: CollectedByCategory,
): TemplateExport => {
  const needsV2 =
    payload.permissions !== undefined ||
    Object.keys(payload.manifests.inboxes ?? {}).length > 0 ||
    categoriesRequiringV2(templateAdapterRegistry).some(
      (category) => (results[category]?.entries.length ?? 0) > 0,
    )
  const parsed = parseTemplateExport({
    formatVersion: needsV2
      ? TEMPLATE_EXPORT_FORMAT_VERSION_V2
      : TEMPLATE_EXPORT_FORMAT_VERSION,
    ...payload,
  })
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
  return parsed.data
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
  const { idsByCategory, selectedTagIds, selectedCustomFieldIds } =
    await resolveSnapshotSelection(workspaceId, selection)
  const results = await collectSnapshotClosure(workspaceId, idsByCategory)

  // A copy installed from a View-only template must not leave this workspace
  // as editable content inside a new template (selected or pulled in).
  await assertNoViewOnlyCopies(workspaceId, idsByCategory)

  // Tags and custom fields an included resource uses ship even when their own
  // category was not selected (the install would otherwise leave a foreign id
  // in the copied flow). The row queries below only return this workspace's
  // live rows.
  const referenced = await resolveReferencedManifestIds(
    workspaceId,
    allEntries(results),
  )
  const tagIds = [...new Set([...selectedTagIds, ...referenced.tagIds])]
  const customFieldIds = [
    ...new Set([...selectedCustomFieldIds, ...referenced.customFieldIds]),
  ]
  if (
    collectedResourceCount(results) + tagIds.length + customFieldIds.length >
    MAX_PAYLOAD_RESOURCES
  ) {
    throw templatePayloadTooLargeException()
  }

  // Step 3: manifests. Every category's folder / product category references
  // are merged before either ancestry walk runs.
  const triggerConditions = (results.triggers?.entries ?? []).flatMap(
    (entry) => (entry.conditions ?? []) as TriggerConditionRow[],
  )
  // The pipeline and place scans read only each flow's graph arrays.
  const flowGraphs = (results.flows?.entries ?? []).map((entry) => ({
    nodes: Array.isArray(entry.nodes) ? entry.nodes : [],
    edges: Array.isArray(entry.edges) ? entry.edges : [],
  }))
  // First: the folders of the manifest include the ones these rows sit in.
  const [tagRows, customFieldRows] = await Promise.all([
    templateSnapshotRepository.findTags({ workspaceId, ids: tagIds }),
    templateSnapshotRepository.findCustomFields({
      workspaceId,
      ids: customFieldIds,
    }),
  ])
  const [
    folderManifest,
    productCategoryManifest,
    pipelineManifest,
    placeCategoryManifest,
    inboxManifest,
  ] = await Promise.all([
    collectFolderAncestry(workspaceId, [
      ...new Set([
        ...uniqueOf(results, (result) => result.folderIds),
        ...[...tagRows, ...customFieldRows].flatMap((row) =>
          row.folderId ? [row.folderId] : [],
        ),
      ]),
    ]),
    collectProductCategoryAncestry(
      workspaceId,
      uniqueOf(results, (result) => result.productCategoryIds),
    ),
    collectPipelineManifest(workspaceId, flowGraphs, triggerConditions),
    collectPlaceCategoryManifest(workspaceId, flowGraphs),
    buildInboxManifest(
      workspaceId,
      uniqueOf(results, (result) => result.inboxIds),
    ),
  ])

  const droppedReferenceCount = countDroppedReferences({
    results,
    referenced,
    foundTagIds: new Set(tagRows.map((row) => row.id)),
    foundCustomFieldIds: new Set(customFieldRows.map((row) => row.id)),
    triggerConditions,
    pipelineManifest,
    productCategoryIds: new Set(Object.keys(productCategoryManifest)),
    placeCategoryIds: new Set(Object.keys(placeCategoryManifest)),
  })

  const itemPermissions = buildItemPermissions(selection, {
    ...Object.fromEntries(
      RESOURCE_CATEGORIES.map((category) => [
        category,
        (results[category]?.entries ?? []).map((entry) => entry.sourceId),
      ]),
    ),
    tags: tagRows.map((row) => row.id),
    customFields: customFieldRows.map((row) => row.id),
    productCategories: Object.keys(productCategoryManifest),
  })
  const payload = finalizeSnapshotPayload(
    {
      ...(Object.keys(itemPermissions).length > 0
        ? { permissions: itemPermissions }
        : {}),
      exportedAt: new Date().toISOString(),
      source: { workspaceId, tenantId },
      manifests: {
        customFields: buildCustomFieldManifestEntries(customFieldRows),
        tags: buildTagManifestEntries(tagRows),
        productCategories: productCategoryManifest,
        folders: folderManifest,
        pipelines: pipelineManifest,
        placeCategories: placeCategoryManifest,
        inboxes: inboxManifest,
      },
      resources: buildPayloadResources(results),
    } as Omit<TemplateExport, "formatVersion">,
    results,
  )

  return {
    payload,
    categoryCounts: categoryCountsOfPayload(payload),
    droppedReferenceCount,
  }
}
