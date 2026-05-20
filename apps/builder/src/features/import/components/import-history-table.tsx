"use client"

import type { ImportStatus } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import type { listImports } from "../queries/list-imports.queries"
import type { ListImportsItem } from "../schemas/query"

type ImportHistoryTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listImports>>]>
}

const STATUS_VARIANTS: Record<
  ImportStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  processing: "default",
  completed: "outline",
  failed: "destructive",
}

export function ImportHistoryTable({ promises }: ImportHistoryTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)

  const columns = useMemo<ColumnDef<ListImportsItem>[]>(
    () => [
      {
        id: "keyword",
        accessorKey: "fileName",
        size: 320,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="truncate font-medium" title={row.original.fileName}>
            {row.original.fileName}
          </div>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "status",
        size: 120,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => {
          const status = row.original.status
          const labelKey = `fields.status.${status}` as const
          return (
            <Badge variant={STATUS_VARIANTS[status]}>
              {t.has(labelKey) ? t(labelKey) : status}
            </Badge>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "progress",
        size: 120,
        header: t("fields.import.histories.progress"),
        cell: ({ row }) => {
          const { processedCount, totalCount } = row.original
          return (
            <div className="tabular-nums">
              {processedCount}
              {totalCount ? ` / ${totalCount}` : ""}
            </div>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "successCount",
        size: 100,
        header: t("fields.import.histories.success"),
        cell: ({ row }) => (
          <span className="text-emerald-600 tabular-nums">
            {row.original.successCount}
          </span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "failedCount",
        size: 100,
        header: t("fields.import.histories.failed"),
        cell: ({ row }) => (
          <span className="text-red-600 tabular-nums">
            {row.original.failedCount}
          </span>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "createdAt",
        size: 150,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd HH:mm"),
        enableSorting: true,
        enableHiding: false,
      },
      {
        accessorKey: "completedAt",
        size: 150,
        header: t("fields.import.histories.completedAt"),
        cell: ({ row }) =>
          row.original.completedAt
            ? format(row.original.completedAt, "yyyy/MM/dd HH:mm")
            : "—",
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
    },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
