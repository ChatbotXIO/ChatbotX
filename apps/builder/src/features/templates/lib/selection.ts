import type { TemplateCategory } from "@chatbotx.io/database/partials"

/**
 * `"all"` stays a sentinel in the form — it is expanded server-side at save
 * time (see `buildTemplateSnapshot`), never materialized on the client. The
 * client only ever has the currently-loaded page, so resolving "all" here
 * would silently under-select under pagination.
 */
export type CategorySelectionState =
  | { mode: "all"; lockAll?: boolean }
  | { mode: "ids"; ids: string[]; lockedIds?: string[] }

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

/** True when the item installs as a read-only (View only) copy. */
export const isItemLocked = (
  selection: CategorySelectionState,
  id: string,
): boolean =>
  selection.mode === "all"
    ? Boolean(selection.lockAll)
    : (selection.lockedIds ?? []).includes(id)

/** The locked ids of an explicit selection; a `mode:"all"` lock is `lockAll`, not an id list. */
const lockedIdsOf = (selection: CategorySelectionState): string[] =>
  selection.mode === "ids" ? (selection.lockedIds ?? []) : []

/**
 * An explicit selection of `ids` carrying over which of them are locked. Locks
 * on an id that is no longer selected are dropped, so the saved selection never
 * names a locked item that is not in it.
 */
export const explicitSelection = (
  ids: string[],
  lockedIds: readonly string[],
): CategorySelectionState => {
  const selected = new Set(ids)
  const locked = [...new Set(lockedIds)].filter((id) => selected.has(id))
  return locked.length > 0
    ? { mode: "ids", ids, lockedIds: locked }
    : { mode: "ids", ids }
}

/** Marks every selected item View only, or editable again. */
export const withAllLocked = (
  selection: CategorySelectionState,
  locked: boolean,
): CategorySelectionState => {
  if (selection.mode === "all") {
    return { mode: "all", lockAll: locked }
  }
  return explicitSelection(selection.ids, locked ? selection.ids : [])
}

/**
 * Marks one explicitly selected item View only, or editable. `baseIds` is the
 * exact id list a `mode:"all"` selection stands for (needed to downgrade it to
 * an explicit list without losing the other items' lock).
 */
export const withItemLocked = (
  selection: CategorySelectionState,
  id: string,
  locked: boolean,
  baseIds: readonly string[],
): CategorySelectionState => {
  if (selection.mode === "all") {
    const allLocked = Boolean(selection.lockAll)
    const lockedIds = allLocked ? baseIds.filter((item) => item !== id) : []
    return explicitSelection(
      [...baseIds],
      locked ? [...lockedIds, id] : lockedIds,
    )
  }
  const current = lockedIdsOf(selection)
  return explicitSelection(
    selection.ids,
    locked ? [...current, id] : current.filter((item) => item !== id),
  )
}

/**
 * Selects every item, keeping the View-only marks already set. `allIds` is the
 * exact id list when the category is small enough to know it; without it the
 * selection becomes `mode:"all"`, which can only carry a category-wide lock.
 */
export const withAllSelected = (
  selection: CategorySelectionState,
  allIds: readonly string[] | undefined,
): CategorySelectionState => {
  const lockAll = selection.mode === "all" && Boolean(selection.lockAll)
  if (!allIds) {
    return { mode: "all", lockAll }
  }
  return explicitSelection(
    [...allIds],
    lockAll ? allIds : lockedIdsOf(selection),
  )
}
