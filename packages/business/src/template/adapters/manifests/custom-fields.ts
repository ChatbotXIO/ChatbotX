import { inArray } from "@chatbotx.io/database/client"
import type { CustomFieldType } from "@chatbotx.io/database/partials"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { TemplateCustomFieldManifestEntry } from "@chatbotx.io/flow-config"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { customFieldService } from "../../../custom-field/service"
import { computeCustomFieldNameBindings } from "../../field-token-binder"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-create custom fields from the template's manifest, reusing
 * `customFieldService.resolveByNameAndType` verbatim — the same
 * find-or-create-by-(name,type) semantics `flow/service.ts` already relies
 * on for single-flow import, so there is exactly one implementation of "does
 * a custom field with this name/type already exist in this workspace".
 *
 * `installFolder` (set when the template asked for an install folder) places
 * only the fields this call CREATES in it; a field the installer already had is
 * reused where it is and never moved.
 */
export const resolveCustomFieldManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateCustomFieldManifestEntry>>,
  options: { installFolder?: () => Promise<string> } = {},
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }

  const { resolved, createdIds } =
    await customFieldService.resolveByNameAndType({
      workspaceId: ctx.workspaceId,
      fields: entries.map(([, field]) => field),
      tx: ctx.tx,
    })
  const createdIdSet = new Set(createdIds)
  if (options.installFolder && createdIds.length > 0) {
    await ctx.tx
      .update(customFieldModel)
      .set({ folderId: await options.installFolder() })
      .where(inArray(customFieldModel.id, createdIds))
  }

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

  const { bindings, renamed, ambiguous } = computeCustomFieldNameBindings(
    entries.map(([sourceId, field]) => ({
      sourceId,
      name: field.name,
      type: field.type,
      target: target(field),
    })),
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
