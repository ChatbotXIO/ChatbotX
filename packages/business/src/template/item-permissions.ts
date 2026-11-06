import type {
  TemplateCategory,
  TemplateSelection,
} from "@chatbotx.io/database/partials"
import type { TemplateItemPermissions } from "@chatbotx.io/flow-config"
import { ChatbotXException } from "../errors"

/**
 * The per-item View-only choices a selection carries, as the payload's
 * `permissions` map. Only a locked item is listed (an absent item is
 * editable), so a template with no locks adds nothing to the payload and
 * stays a v1 payload an older worker can still install.
 *
 * `entryIdsByCategory` are the ids of the entries actually in the payload for
 * each category — the selection, plus whatever dependencies were folded in.
 * `lockAll` locks the whole category, dependencies included; `lockedIds` must
 * each be one of the explicitly selected ids, or the save is rejected rather
 * than silently locking nothing.
 */
export const buildItemPermissions = (
  selection: TemplateSelection,
  entryIdsByCategory: Partial<Record<TemplateCategory, readonly string[]>>,
): TemplateItemPermissions => {
  const permissions: TemplateItemPermissions = {}
  for (const [category, categorySelection] of Object.entries(selection) as [
    TemplateCategory,
    NonNullable<TemplateSelection[TemplateCategory]>,
  ][]) {
    const present = entryIdsByCategory[category] ?? []
    const lockedIds = lockedIdsOf(categorySelection, present)
    if (lockedIds.length > 0) {
      permissions[category] = Object.fromEntries(
        lockedIds.map((id) => [id, { allowEdit: false }]),
      )
    }
  }
  return permissions
}

const lockedIdsOf = (
  selection: NonNullable<TemplateSelection[TemplateCategory]>,
  present: readonly string[],
): string[] => {
  if (selection.mode === "all") {
    return selection.lockAll ? [...present] : []
  }
  const lockedIds = selection.lockedIds ?? []
  if (lockedIds.some((id) => !selection.ids.includes(id))) {
    throw new ChatbotXException(
      "A locked item must be one of the selected items",
      "templateSaveInvalidSelection",
    )
  }
  const presentSet = new Set(present)
  return lockedIds.filter((id) => presentSet.has(id))
}
