import { useTranslations } from "next-intl"
import { useRef } from "react"
import { toast } from "sonner"
import {
  type CategorySelectionState,
  explicitSelection,
  summarizeSelection,
  withAllLocked,
  withAllSelected,
  withItemLocked,
} from "./selection"

type UseCategorySelectionInput = {
  selection: CategorySelectionState
  onChange: (next: CategorySelectionState) => void
  allIds: readonly string[] | undefined
  total: number
  /** Fetches the exact unfiltered id list; used when `allIds` is unknown. */
  fetchAllIds: () => Promise<string[]>
}

/**
 * The select-all / lock-all / per-row handlers of one category. Downgrading
 * a `mode:"all"` selection to an explicit list must be exact, so it uses
 * `allIds` when known and otherwise fetches the full unfiltered list instead
 * of silently falling back to the loaded page.
 */
export const useCategorySelection = ({
  selection,
  onChange,
  allIds,
  total,
  fetchAllIds,
}: UseCategorySelectionInput) => {
  const t = useTranslations()
  // The handlers below await a fetch: they must apply their change to the
  // selection as it is when the fetch lands, not as it was when they started.
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const summary = summarizeSelection(selection, total)
  const selectedIds =
    selection.mode === "ids" ? new Set(selection.ids) : undefined

  const isRowChecked = (id: string): boolean =>
    summary.isAllMode || (selectedIds?.has(id) ?? false)

  const loadBaseIds = async (): Promise<string[]> =>
    allIds ? [...allIds] : await fetchAllIds()

  /** The exact id list, or `undefined` after telling the user it could not be loaded. */
  const loadBaseIdsOrToast = async (): Promise<string[] | undefined> => {
    try {
      return await loadBaseIds()
    } catch {
      toast.error(t("messages.errorLoadingData"))
      return
    }
  }

  const toggleRow = async (id: string, checked: boolean) => {
    let base: string[] = []
    if (selectionRef.current.mode === "all") {
      const loaded = await loadBaseIdsOrToast()
      if (!loaded) {
        return
      }
      base = loaded
    }
    const current = selectionRef.current
    if (current.mode === "all") {
      const next = checked ? base : base.filter((itemId) => itemId !== id)
      // Unselecting one row of an all-locked selection keeps the rest locked.
      onChange(explicitSelection(next, current.lockAll ? base : []))
      return
    }
    const next = checked
      ? [...new Set([...current.ids, id])]
      : current.ids.filter((itemId) => itemId !== id)
    onChange(explicitSelection(next, current.lockedIds ?? []))
  }

  const toggleRowLock = async (id: string, locked: boolean) => {
    let base: string[] = []
    if (selectionRef.current.mode === "all") {
      const loaded = await loadBaseIdsOrToast()
      if (!loaded) {
        return
      }
      base = loaded
    }
    onChange(withItemLocked(selectionRef.current, id, locked, base))
  }

  const toggleSelectAll = (checked: boolean) => {
    onChange(
      checked ? withAllSelected(selection, allIds) : { mode: "ids", ids: [] },
    )
  }

  const toggleLockAll = (locked: boolean) =>
    onChange(withAllLocked(selection, locked))

  return {
    ...summary,
    isRowChecked,
    toggleRow,
    toggleRowLock,
    toggleSelectAll,
    toggleLockAll,
  }
}
