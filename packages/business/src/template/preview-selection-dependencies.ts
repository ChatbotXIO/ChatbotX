import type { TemplateSelection } from "@chatbotx.io/database/partials"
import { previewDependencies } from "./install-preview"
import {
  assertCanReadTemplateCategories,
  assertCanReadTemplates,
  type TemplateActor,
} from "./permissions"

const selectionCategoryCounts = (
  selection: TemplateSelection,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(selection).map(([category, chosen]) => [
      category,
      chosen?.mode === "all" ? 1 : (chosen?.ids.length ?? 0),
    ]),
  )

/**
 * What saving `selection` would take along on its own (the rows a selected one
 * needs, and the tags, custom fields and the like the snapshot ships), behind
 * the read gates: viewing templates, and every category the selection names.
 * Read only, so a `read_only` API token may call it.
 */
export const previewSelectionDependencies = async (input: {
  workspaceId: string
  tenantId: string
  selection: TemplateSelection
  actor: TemplateActor
}) => {
  assertCanReadTemplates(input.actor)
  assertCanReadTemplateCategories(
    input.actor,
    selectionCategoryCounts(input.selection),
  )
  const { categoryCounts, ...preview } = await previewDependencies({
    workspaceId: input.workspaceId,
    tenantId: input.tenantId,
    selection: input.selection,
  })
  // What the template would take along names rows of categories the selection
  // did not mention: refuse exactly as the save would, before any name leaves.
  assertCanReadTemplateCategories(input.actor, categoryCounts)
  return preview
}
