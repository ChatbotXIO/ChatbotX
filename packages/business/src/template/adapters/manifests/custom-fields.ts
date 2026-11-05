import { inArray } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { templateInstalledResourceRepository } from "@chatbotx.io/database/repositories/template-installed-resource"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { TemplateCustomFieldManifestEntry } from "@chatbotx.io/flow-config"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import {
  customFieldService,
  type ResolvedCustomField,
} from "../../../custom-field/service"
import { computeCustomFieldNameBindings } from "../../field-token-binder"
import type { TemplateInstallContext } from "../types"
import { placeCreatedRows } from "./folders"
import { pickPriorCopies } from "./prior-copies"

/**
 * Find-or-create custom fields from the template's manifest, reusing
 * `customFieldService.resolveByNameAndType` verbatim — the same
 * find-or-create-by-(name,type) semantics `flow/service.ts` already relies
 * on for single-flow import, so there is exactly one implementation of "does
 * a custom field with this name/type already exist in this workspace".
 *
 * Only the fields this call CREATES are placed, in their template folder or else
 * `installFolder` (set when the template asked for an install folder); a field
 * the installer already had is reused where it is and never moved.
 */
export const resolveCustomFieldManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateCustomFieldManifestEntry>>,
  options: {
    installFolder?: () => Promise<string>
    /** The whole manifest when `manifest` is only part of it (a sync's new fields). */
    fullManifest?: Readonly<Record<string, TemplateCustomFieldManifestEntry>>
  } = {},
): Promise<void> => {
  const allEntries = Object.entries(manifest)
  if (allEntries.length === 0) {
    return
  }
  // A field an earlier install of this workspace created from the SAME source
  // field (same type, still there) is reused, even under its renamed or
  // since-edited name: otherwise every new install of a template whose field
  // collided would mint another `<name>_<n>`.
  const reused = await reusePriorCopies(ctx, allEntries)
  const entries = allEntries.filter(([sourceId]) => !reused.has(sourceId))
  const { resolved, createdIds } =
    entries.length > 0
      ? await customFieldService.resolveByNameAndType({
          workspaceId: ctx.workspaceId,
          fields: entries.map(([, field]) => field),
          tx: ctx.tx,
        })
      : { resolved: new Map<string, ResolvedCustomField>(), createdIds: [] }
  const createdIdSet = new Set(createdIds)
  await placeCreatedRows(
    ctx,
    entries.flatMap(([, field]) => {
      const id = resolved.get(customFieldResolutionKey(field))?.id
      return id && createdIdSet.has(id)
        ? [{ id, folderSourceId: field.folderSourceId }]
        : []
    }),
    options.installFolder,
    async (folderId, ids) => {
      await ctx.tx
        .update(customFieldModel)
        .set({ folderId })
        .where(inArray(customFieldModel.id, ids))
    },
  )

  if (!ctx.idMaps.customField) {
    ctx.idMaps.customField = new Map()
  }
  const idMap = ctx.idMaps.customField
  const target = (field: { name: string; type: CustomFieldType }) =>
    resolved.get(customFieldResolutionKey(field))

  for (const [sourceId, field] of entries) {
    const resolvedField = target(field)
    if (!resolvedField) {
      ctx.warn({
        category: "customFields",
        entityKind: "customField",
        path: `manifests.customFields.${sourceId}`,
        value: sourceId,
      })
      continue
    }
    idMap.set(sourceId, resolvedField.id)
    ctx.track({
      category: "customFields",
      resourceKind: "customField",
      resourceId: resolvedField.id,
      sourceResourceId: sourceId,
      wasExisting: !createdIdSet.has(resolvedField.id),
    })
  }

  // Over the whole manifest: two source fields sharing a name stay ambiguous
  // whether their copies are new, reused or already mapped.
  const manifestById = new Map(allEntries)
  const { bindings, renamed, ambiguous } = computeCustomFieldNameBindings(
    Object.entries(options.fullManifest ?? manifest).map(
      ([sourceId, field]) => ({
        sourceId,
        name: field.name,
        type: field.type,
        target:
          reused.get(sourceId) ??
          (manifestById.has(sourceId) ? target(field) : undefined),
      }),
    ),
  )
  for (const rename of renamed) {
    ctx.warn({
      category: "customFields",
      entityKind: "customFieldRenamed",
      path: `manifests.customFields.${rename.sourceId}`,
      value: `${rename.from} -> ${rename.to} (${rename.type})`,
    })
  }
  for (const { sourceId, name } of ambiguous) {
    ctx.warn({
      category: "customFields",
      entityKind: "ambiguousSourceFieldToken",
      path: `manifests.customFields.${sourceId}`,
      value: name,
    })
  }
  ctx.customFieldNameBindings = new Map([
    ...(ctx.customFieldNameBindings ?? []),
    ...bindings,
  ])
}

/**
 * Maps every manifest entry that an earlier install already copied into this
 * workspace (and whose copy still exists with the same type) to that copy.
 * Returns the copies by source id, for the `{{name}}` bindings.
 */
const reusePriorCopies = async (
  ctx: TemplateInstallContext,
  entries: readonly (readonly [string, TemplateCustomFieldManifestEntry])[],
): Promise<Map<string, { name: string; renamed: boolean }>> => {
  const reused = new Map<string, { name: string; renamed: boolean }>()
  const prior = await templateInstalledResourceRepository.findPriorCopies(
    {
      workspaceId: ctx.workspaceId,
      resourceKind: "customField",
      sourceResourceIds: entries.map(([sourceId]) => sourceId),
    },
    ctx.tx,
  )
  if (prior.length === 0) {
    return reused
  }
  const fields = await ctx.tx.query.customFieldModel.findMany({
    where: {
      workspaceId: ctx.workspaceId,
      id: { in: [...new Set(prior.map((row) => row.resourceId))] },
    },
    columns: { id: true, name: true, type: true },
  })
  if (!ctx.idMaps.customField) {
    ctx.idMaps.customField = new Map()
  }
  for (const [sourceId, field] of pickPriorCopies(prior, fields, entries)) {
    reused.set(sourceId, { name: field.name, renamed: false })
    ctx.idMaps.customField.set(sourceId, field.id)
    ctx.track({
      category: "customFields",
      resourceKind: "customField",
      resourceId: field.id,
      sourceResourceId: sourceId,
      wasExisting: true,
    })
  }
  return reused
}
