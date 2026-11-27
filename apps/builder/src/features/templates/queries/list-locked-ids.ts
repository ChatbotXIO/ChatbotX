import { listLockedIds, listUndeletableIds } from "@chatbotx.io/business"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"

/**
 * The ids, among `resourceIds` (one list page), installed from a template
 * that forbids editing them (`lockedIds`) or deleting them (`undeletableIds`).
 * One query each for the whole page, never one per row.
 */
export const listLockedTemplateResourceIds = async (input: {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
  /** Skip the second query when the caller only needs `lockedIds` (editor guard); `undeletableIds` is then `[]`. */
  includeUndeletable?: boolean
}): Promise<{ lockedIds: string[]; undeletableIds: string[] }> => {
  if (input.resourceIds.length === 0) {
    return { lockedIds: [], undeletableIds: [] }
  }
  const scope = {
    workspaceId: input.workspaceId,
    resourceKind: input.resourceKind,
    resourceIds: input.resourceIds,
  }
  const [lockedIds, undeletableIds] = await Promise.all([
    listLockedIds(scope),
    input.includeUndeletable === false
      ? Promise.resolve<string[]>([])
      : listUndeletableIds(scope),
  ])
  return { lockedIds, undeletableIds }
}
