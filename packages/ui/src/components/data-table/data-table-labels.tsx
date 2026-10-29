"use client"

import { createContext, type ReactNode, useContext, useMemo } from "react"

export type DataTablePaginationLabels = {
  selectedRows?: (selected: number, total: number) => string
  rowsPerPage?: string
  pageOf?: (page: number, pageCount: number) => string
  firstPage?: string
  previousPage?: string
  nextPage?: string
  lastPage?: string
}

export type DataTableLabels = DataTablePaginationLabels & {
  noResults?: string
}

/**
 * Default labels for every `DataTable` and `DataTablePagination`.
 * packages/ui has no i18n of its own, so the app provides the translated
 * text once instead of threading `labels` through each table; a table's own
 * `labels` prop still wins key by key. Without a provider the labels stay
 * English, exactly as before.
 */
const DataTableLabelsContext = createContext<DataTableLabels>({})

export function DataTableLabelsProvider({
  value,
  children,
}: {
  value: DataTableLabels
  children: ReactNode
}) {
  return (
    <DataTableLabelsContext.Provider value={value}>
      {children}
    </DataTableLabelsContext.Provider>
  )
}

export function useDataTableLabels(overrides?: DataTableLabels) {
  const defaults = useContext(DataTableLabelsContext)
  return useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides])
}
