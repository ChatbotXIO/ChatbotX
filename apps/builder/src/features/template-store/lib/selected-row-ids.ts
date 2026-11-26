import type { RowSelectionState } from "@tanstack/react-table"

/**
 * The ids of every checked row. The table pages on the server and keeps the
 * selection across pages, so this reads the selection state, not the rows of
 * the page on screen.
 */
export const selectedRowIds = (selection: RowSelectionState): string[] =>
  Object.entries(selection)
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id)
