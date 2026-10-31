"use client"

import { DataTableLabelsProvider } from "@chatbotx.io/ui/components/data-table/data-table-labels"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"

/**
 * Feeds translated pagination and empty-state labels to every `DataTable` of
 * packages/ui, which has no i18n of its own. Reuses the keys the hand-rolled
 * paginations already share (`analytics.pagination.*`, `messages.noResults`).
 */
export function DataTableLabelsBridge({ children }: { children: ReactNode }) {
  const t = useTranslations()

  const labels = useMemo(
    () => ({
      noResults: t("messages.noResults"),
      selectedRows: (selected: number, total: number) =>
        t("analytics.pagination.selectedRows", { selected, total }),
      rowsPerPage: t("analytics.pagination.rowsPerPage"),
      pageOf: (page: number, pageCount: number) =>
        t("analytics.pagination.pageOf", { page, pageCount }),
      firstPage: t("analytics.pagination.firstPage"),
      previousPage: t("analytics.pagination.previousPage"),
      nextPage: t("analytics.pagination.nextPage"),
      lastPage: t("analytics.pagination.lastPage"),
    }),
    [t],
  )

  return (
    <DataTableLabelsProvider value={labels}>{children}</DataTableLabelsProvider>
  )
}
