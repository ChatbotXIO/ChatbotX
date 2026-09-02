import type { TemplateCategory } from "@chatbotx.io/database/partials"

/**
 * `"all"` stays a sentinel in the form — it is expanded server-side at save
 * time (see `buildTemplateSnapshot`), never materialized on the client. The
 * client only ever has the currently-loaded page, so resolving "all" here
 * would silently under-select under pagination.
 */
export type CategorySelectionState =
  | { mode: "all" }
  | { mode: "ids"; ids: string[] }

export type TemplateSelectionFormState = Partial<
  Record<TemplateCategory, CategorySelectionState>
>

export const EMPTY_SELECTION: CategorySelectionState = {
  mode: "ids",
  ids: [],
}

export const selectionCount = (
  selection: CategorySelectionState | undefined,
  totalHint?: number,
): number => {
  if (!selection) {
    return 0
  }
  if (selection.mode === "all") {
    return totalHint ?? 0
  }
  return selection.ids.length
}
