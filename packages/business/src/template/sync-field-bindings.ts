import { type DatabaseClient, inArray } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { computeCustomFieldNameBindings } from "./field-token-binder"

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
  const targetIds = [...mapped.values()]
  if (targetIds.length === 0) {
    return new Map()
  }
  const rows = await tx
    .select({ id: customFieldModel.id, name: customFieldModel.name })
    .from(customFieldModel)
    .where(inArray(customFieldModel.id, targetIds))
  const nameById = new Map(rows.map((row) => [row.id, row.name]))
  const targetNameOf = (sourceId: string): string | undefined =>
    nameById.get(mapped.get(sourceId) ?? "")
  // The same rule as an install, so a name two source fields share stays unbound.
  return computeCustomFieldNameBindings(
    Object.entries(manifest).map(([sourceId, field]) => {
      const name = targetNameOf(sourceId)
      return {
        sourceId,
        name: field.name,
        type: field.type,
        target: name ? { name, renamed: false } : undefined,
      }
    }),
  ).bindings
}
