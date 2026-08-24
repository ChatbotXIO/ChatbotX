import type { TemplateCustomFieldManifestEntry } from "@chatbotx.io/flow-config"
import { customFieldResolutionKey } from "@chatbotx.io/utils/custom-field"
import { customFieldService } from "../../../custom-field/service"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-create custom fields from the template's manifest, reusing
 * `customFieldService.resolveByNameAndType` verbatim — the same
 * find-or-create-by-(name,type) semantics `flow/service.ts` already relies
 * on for single-flow import, so there is exactly one implementation of "does
 * a custom field with this name/type already exist in this workspace".
 */
export const resolveCustomFieldManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateCustomFieldManifestEntry>>,
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }

  const { idMap: resolvedByKey, createdIds } =
    await customFieldService.resolveByNameAndType({
      workspaceId: ctx.workspaceId,
      fields: entries.map(([, field]) => field),
      tx: ctx.tx,
    })
  const createdIdSet = new Set(createdIds)

  if (!ctx.idMaps.customField) {
    ctx.idMaps.customField = new Map()
  }
  const idMap = ctx.idMaps.customField
  for (const [sourceId, field] of entries) {
    const targetId = resolvedByKey.get(customFieldResolutionKey(field))
    if (!targetId) {
      ctx.warn({
        category: "customFields",
        entityKind: "customField",
        path: `manifests.customFields.${sourceId}`,
        value: sourceId,
      })
      continue
    }
    idMap.set(sourceId, targetId)
    ctx.track({
      category: "customFields",
      resourceKind: "customField",
      resourceId: targetId,
      sourceResourceId: sourceId,
      wasExisting: !createdIdSet.has(targetId),
    })
  }
}
