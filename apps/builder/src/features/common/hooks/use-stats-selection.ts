"use client"

import { useCallback, useState } from "react"

export type StatsSelection =
  | { mode: "all"; excludedIds: ReadonlySet<string> }
  | { mode: "manual"; includedIds: ReadonlySet<string> }

export function isContactSelected(
  selection: StatsSelection,
  contactId: string,
): boolean {
  return selection.mode === "all"
    ? !selection.excludedIds.has(contactId)
    : selection.includedIds.has(contactId)
}

export function toggleContactSelection(
  selection: StatsSelection,
  contactId: string,
  total?: number,
): StatsSelection {
  if (selection.mode === "all") {
    const excludedIds = new Set(selection.excludedIds)
    if (excludedIds.has(contactId)) {
      excludedIds.delete(contactId)
    } else {
      excludedIds.add(contactId)
    }
    return { mode: "all", excludedIds }
  }

  const includedIds = new Set(selection.includedIds)
  if (includedIds.has(contactId)) {
    includedIds.delete(contactId)
  } else {
    includedIds.add(contactId)
  }

  if (typeof total === "number" && total > 0 && includedIds.size >= total) {
    return { mode: "all", excludedIds: new Set() }
  }

  return { mode: "manual", includedIds }
}

export function toggleHeaderSelection(
  selection: StatsSelection,
): StatsSelection {
  if (selection.mode === "all" && selection.excludedIds.size === 0) {
    return { mode: "manual", includedIds: new Set() }
  }

  return { mode: "all", excludedIds: new Set() }
}

export function getSelectedCount(
  selection: StatsSelection,
  total: number,
): number {
  if (selection.mode === "manual") {
    return selection.includedIds.size
  }

  return Math.max(0, total - selection.excludedIds.size)
}

export interface HeaderCheckboxState {
  checked: boolean
  indeterminate: boolean
}

export function getHeaderCheckboxState(
  selection: StatsSelection,
  total?: number,
): HeaderCheckboxState {
  if (selection.mode === "all") {
    return selection.excludedIds.size === 0
      ? { checked: true, indeterminate: false }
      : { checked: false, indeterminate: true }
  }

  if (
    typeof total === "number" &&
    total > 0 &&
    selection.includedIds.size >= total
  ) {
    return { checked: true, indeterminate: false }
  }

  return selection.includedIds.size === 0
    ? { checked: false, indeterminate: false }
    : { checked: false, indeterminate: true }
}

const createAllSelection = (): StatsSelection => ({
  mode: "all",
  excludedIds: new Set(),
})

export function useStatsSelection(total: number) {
  const [selection, setSelection] = useState<StatsSelection>(createAllSelection)

  const reset = useCallback(() => {
    setSelection(createAllSelection())
  }, [])

  const toggleContact = useCallback(
    (contactId: string) => {
      setSelection((current) =>
        toggleContactSelection(current, contactId, total),
      )
    },
    [total],
  )

  const toggleHeader = useCallback(() => {
    setSelection((current) => toggleHeaderSelection(current))
  }, [])

  return {
    selection,
    reset,
    toggleContact,
    toggleHeader,
    selectedCount: getSelectedCount(selection, total),
    headerState: getHeaderCheckboxState(selection, total),
    isSelected: (contactId: string) => isContactSelected(selection, contactId),
  }
}
