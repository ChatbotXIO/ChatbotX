import { db } from "@chatbotx.io/database/client"
import type {
  TemplateCategoryCounts,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import { templateCategories } from "@chatbotx.io/database/partials"
import type {
  CustomFieldModel,
  FlowModel,
  TagModel,
} from "@chatbotx.io/database/types"
import {
  type FlowExportedFlow,
  parseTemplateExport,
  TEMPLATE_EXPORT_FORMAT_VERSION,
  type TemplateExport,
} from "@chatbotx.io/flow-config"
import { ChatbotXException } from "../errors"
import { flowVersionService } from "../flow-version"

const MAX_PAYLOAD_RESOURCES = 200

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

/**
 * Deduplicates then verifies every id belongs to `workspaceId` — the save
 * action receives arbitrary id arrays for every category, so this is the
 * one gate standing between a crafted request and smuggling another
 * workspace's resources into a shareable template. Modeled on
 * `ensureAllFlowIdsExists` (`apps/builder/src/features/flows/queries/
 * index.ts`), including its count-vs-length comparison — hence the
 * mandatory dedupe first, since that comparison throws a false negative on
 * duplicate ids.
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

const resolveFlowIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await db.query.flowModel.findMany({
    where: { workspaceId, id: { in: uniqueIds } },
    columns: { id: true },
  })

const resolveTagIds = async (
  workspaceId: string,
  uniqueIds: string[],
): Promise<{ id: string }[]> =>
  await db.query.tagModel.findMany({
    where: { workspaceId, id: { in: uniqueIds } },
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
 * `mode:"all"` is expanded server-side to the current row set at save time
 * — the client only ever has page 1, so materializing on the client would
 * silently under-select under pagination. Concrete category ID resolvers
 * (`resolveSelectionIds`) live per-category below; a category without one
 * yet resolves to an empty list rather than throwing, so unfinished
 * categories degrade to "nothing selected" instead of blocking every save.
 */
const resolveSelectionIds = async (
  workspaceId: string,
  category: string,
  selection: NonNullable<TemplateSelection[keyof TemplateSelection]>,
): Promise<string[]> => {
  if (selection.mode === "ids") {
    return [...new Set(selection.ids)]
  }
  // mode: "all" — resolve to every current row of this category.
  switch (category) {
    case "flows": {
      const rows = await db.query.flowModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    }
    case "tags": {
      const rows = await db.query.tagModel.findMany({
        where: { workspaceId, deletedAt: { isNull: true as const } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    }
    case "customFields": {
      const rows = await db.query.customFieldModel.findMany({
        where: { workspaceId },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    }
    default:
      // TODO(template): wire the remaining categories (products,
      // aiFunctions, aiAgents, calendars, webchats, keywords,
      // entryPointLinks, triggers, fbCommentAutomations, settings) as their
      // own `mode:"all"` resolvers once each feature's existing list query
      // has been reviewed for the right ownership/soft-delete filters.
      return []
  }
}

/**
 * Builds one `flows` resource entry in the shape `flowsAdapter` expects,
 * reusing the workspace's *draft* version — falls back from published per
 * the plan's deviation from single-flow export ("blocking a template on one
 * unpublished flow is hostile").
 */
const buildFlowExportEntry = async (
  workspaceId: string,
  flow: Pick<
    FlowModel,
    "id" | "name" | "active" | "enableInInbox" | "folderId"
  >,
) => {
  const published = await flowVersionService.findPublished({
    flowId: flow.id,
    workspaceId,
  })
  const draft = await flowVersionService.findDraft({
    flowId: flow.id,
    workspaceId,
  })
  const version = published ?? draft
  if (!version) {
    return
  }
  return {
    sourceId: flow.id,
    name: flow.name,
    active: flow.active,
    enableInInbox: flow.enableInInbox,
    startNodeId: version.startNodeId,
    // `FlowVersionModel.nodes`/`edges` are typed loosely at the jsonb
    // boundary (`{id: string; [x: string]: unknown}[]`) even though they are
    // only ever written as validated `FlowVersionSchema[]`/`EdgeSchema[]`
    // rows. `parseTemplateExport` re-validates the full envelope below, so
    // this narrowing is checked before the snapshot is ever persisted.
    nodes: version.nodes as FlowExportedFlow["nodes"],
    edges: version.edges as FlowExportedFlow["edges"],
    folderId: flow.folderId,
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

type BuildSnapshotInput = {
  workspaceId: string
  tenantId: string
  selection: TemplateSelection
}

type BuildSnapshotResult = {
  payload: TemplateExport
  categoryCounts: TemplateCategoryCounts
}

/**
 * Resolves a selection to a concrete, validated snapshot envelope:
 * 1. Verify every explicitly-selected id belongs to the acting workspace.
 * 2. Expand any `mode:"all"` category to the current row set.
 * 3. Build the `flows`/manifest entries.
 * 4. Validate the assembled envelope with `parseTemplateExport` before the
 *    caller persists it — the same discipline the flow export route uses,
 *    validating with `flowExportSchema.parse` before serializing.
 *
 * Caps total resource count at `MAX_PAYLOAD_RESOURCES` — the payload lives
 * in a jsonb column rather than S3, so this is the only guard against an
 * unbounded template.
 */
export const buildTemplateSnapshot = async (
  input: BuildSnapshotInput,
): Promise<BuildSnapshotResult> => {
  const { workspaceId, tenantId, selection } = input

  // Step 1: validate explicit id selections against the acting workspace
  // before resolving anything else.
  const flowSelection = selection.flows
  if (flowSelection?.mode === "ids") {
    await assertIdsBelongToWorkspace(
      workspaceId,
      flowSelection.ids,
      resolveFlowIds,
    )
  }
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

  // Step 2: expand mode:"all" and resolve every category to a concrete id
  // list.
  const flowIds = flowSelection
    ? await resolveSelectionIds(workspaceId, "flows", flowSelection)
    : []
  const tagIds = tagSelection
    ? await resolveSelectionIds(workspaceId, "tags", tagSelection)
    : []
  const customFieldIds = customFieldSelection
    ? await resolveSelectionIds(
        workspaceId,
        "customFields",
        customFieldSelection,
      )
    : []

  const totalResources = flowIds.length + tagIds.length + customFieldIds.length
  if (totalResources > MAX_PAYLOAD_RESOURCES) {
    throw templatePayloadTooLargeException()
  }

  // Step 3: build entries.
  const flowRows =
    flowIds.length > 0
      ? await db.query.flowModel.findMany({
          where: { workspaceId, id: { in: flowIds } },
          columns: {
            id: true,
            name: true,
            active: true,
            enableInInbox: true,
            folderId: true,
          },
        })
      : []
  const flowEntries = (
    await Promise.all(
      flowRows.map((flow) => buildFlowExportEntry(workspaceId, flow)),
    )
  ).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const tagRows =
    tagIds.length > 0
      ? await db.query.tagModel.findMany({
          where: { workspaceId, id: { in: tagIds } },
          columns: { id: true, name: true },
        })
      : []
  const customFieldRows =
    customFieldIds.length > 0
      ? await db.query.customFieldModel.findMany({
          where: { workspaceId, id: { in: customFieldIds } },
          columns: { id: true, name: true, type: true },
        })
      : []

  const payload: TemplateExport = {
    formatVersion: TEMPLATE_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { workspaceId, tenantId },
    manifests: {
      customFields: buildCustomFieldManifestEntries(customFieldRows),
      tags: buildTagManifestEntries(tagRows),
      productCategories: {},
      folders: {},
    },
    resources: {
      flows: flowEntries,
      products: [],
      aiFunctions: [],
      aiAgents: [],
      calendars: [],
      webchats: [],
      keywords: [],
      entryPointLinks: [],
      triggers: [],
      fbCommentAutomations: [],
      settings: { savedReplies: [], botFields: [] },
    },
  }

  const parsed = parseTemplateExport(payload)
  if (!parsed.ok) {
    throw new ChatbotXException(
      `Template snapshot failed validation: ${parsed.reason}`,
      "templateSnapshotInvalid",
    )
  }

  const countByCategory: Partial<Record<string, number>> = {
    flows: flowEntries.length,
    tags: tagRows.length,
    customFields: customFieldRows.length,
  }
  const categoryCounts = Object.fromEntries(
    templateCategories.options.map((category) => [
      category,
      countByCategory[category] ?? 0,
    ]),
  ) as TemplateCategoryCounts

  return { payload: parsed.data, categoryCounts }
}
