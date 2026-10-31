import { type DatabaseClient, inArray } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { TemplateExport } from "@chatbotx.io/flow-config"

/**
 * Target names of the custom fields an earlier install or sync resolved under
 * another spelling, so `{{name}}` tokens keep following them: a second sync
 * must never revert `{{foo_1}}` to `{{foo}}`.
 */
export const durableFieldNameBindings = async (
  tx: DatabaseClient,
  manifest: TemplateExport["manifests"]["customFields"],
  mapped: ReadonlyMap<string, string>,
): Promise<Map<string, string>> => {
  const bindings = new Map<string, string>()
  const targetIds = [...mapped.values()]
  if (targetIds.length === 0) {
    return bindings
  }
  const rows = await tx
    .select({ id: customFieldModel.id, name: customFieldModel.name })
    .from(customFieldModel)
    .where(inArray(customFieldModel.id, targetIds))
  const nameById = new Map(rows.map((row) => [row.id, row.name]))
  for (const [sourceId, targetId] of mapped) {
    const sourceName = manifest[sourceId]?.name
    const targetName = nameById.get(targetId)
    if (sourceName && targetName && sourceName !== targetName) {
      bindings.set(sourceName, targetName)
    }
  }
  return bindings
}
