"use client"

import type { HumanAgentStats } from "@chatbotx.io/analytics"
import ChartHeader from "@chatbotx.io/ui/components/charts/chart-header"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { CardContent } from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@chatbotx.io/ui/types/data-table"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"
import {
  buildResponseSlaColumns,
  buildResponseTimeColumns,
} from "./admins-response-time-columns"

type AdminsAnalysisData = HumanAgentStats

export function AdminsAnalysis() {
  const t = useTranslations()
  const locale = useLocale()
  const humanAgentStats = useAnalysisStore((state) => state.humanAgentStats)

  const data = useMemo(() => humanAgentStats, [humanAgentStats])

  const responseTimeColumns = useMemo(
    () => buildResponseTimeColumns(t, locale),
    [t, locale],
  )

  // The SLA columns only appear once some reply in the range had an SLA, so a
  // workspace without a policy keeps today's table.
  const hasSlaData = useMemo(
    () => data.some((row) => row.responseSlaEligibleCount > 0),
    [data],
  )
  const responseSlaColumns = useMemo(
    () => (hasSlaData ? buildResponseSlaColumns(t) : []),
    [hasSlaData, t],
  )

  const columns = useMemo<ColumnDef<AdminsAnalysisData>[]>(
    () => [
      {
        id: "name",
        accessorKey: "userName",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.userName ||
              row.original.userEmail ||
              row.original.adminId}
          </div>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "messagesSent",
        accessorKey: "messagesSent",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("analytics.messagesSent")}
          />
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "uniqueContacts",
        accessorKey: "uniqueContacts",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("analytics.contacts")}
          />
        ),
        enableSorting: true,
        enableHiding: false,
      },
      ...responseTimeColumns,
      ...responseSlaColumns,
      {
        id: "assignedConversations",
        accessorKey: "assignedConversations",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("analytics.assignedConversations.title")}
          />
        ),
        enableSorting: true,
        enableHiding: false,
      },
    ],
    [t, responseTimeColumns, responseSlaColumns],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount: 1,
    // Rows are all in the store, so sort on the client (null sorts last).
    manualSorting: false,
    initialState: {
      sorting: [{ id: "messagesSent", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.adminId,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <ChartHeader title={t("analytics.admins")} />
      <CardContent>
        <DataTable
          labels={{
            firstPage: t("analytics.pagination.firstPage"),
            lastPage: t("analytics.pagination.lastPage"),
            nextPage: t("analytics.pagination.nextPage"),
            noResults: t("fields.noResults.label"),
            pageOf: (page, pageCount) =>
              t("analytics.pagination.pageOf", { page, pageCount }),
            previousPage: t("analytics.pagination.previousPage"),
            rowsPerPage: t("analytics.pagination.rowsPerPage"),
            selectedRows: (selected, total) =>
              t("analytics.pagination.selectedRows", { selected, total }),
          }}
          table={table}
        />
      </CardContent>
    </>
  )
}
