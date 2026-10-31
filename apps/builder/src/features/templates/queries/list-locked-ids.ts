import { listLockedIds } from "@chatbotx.io/business"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"

/**
 * The ids, among `resourceIds` (one list page), that came from a View-only
 * template and so cannot be edited. One query for the whole page, never one
 * per row.
 */
export const listLockedTemplateResourceIds = async (input: {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
}): Promise<{ lockedIds: string[] }> => {
  if (input.resourceIds.length === 0) {
    return { lockedIds: [] }
  }
  return {
    lockedIds: await listLockedIds({
      workspaceId: input.workspaceId,
      resourceKind: input.resourceKind,
      resourceIds: input.resourceIds,
    }),
  }
}
