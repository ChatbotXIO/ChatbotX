"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { DeletionRecordEvidence } from "@/features/workspaces/components/deletion-record-evidence"
import type { WorkspaceDeletionRecordResource } from "@/features/workspaces/schema/deletion-record"

type DeletedWorkspacesTableProps = {
  promises: Promise<
    [
      {
        data: WorkspaceDeletionRecordResource[]
        pageCount: number
      },
    ]
  >
}

export const DeletedWorkspacesTable = ({
  promises,
}: DeletedWorkspacesTableProps) => {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()

  const columns = useMemo<ColumnDef<WorkspaceDeletionRecordResource>[]>(
    () => [
      {
        id: "search",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => row.original.workspaceName,
        meta: {
          label: t("actions.search"),
          placeholder: t("actions.search"),
          variant: "text",
          filterKey: "search",
        },
        enableColumnFilter: true,
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "owner",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.owner")}
          />
        ),
        cell: ({ row }) =>
          row.original.ownerEmail ?? t("platformAdmin.workspaces.notAvailable"),
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "purgedAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.purgedAt")}
          />
        ),
        cell: ({ row }) =>
          row.original.purgedAt
            ? format(row.original.purgedAt, "PPp")
            : t("platformAdmin.workspaces.notAvailable"),
        enableHiding: false,
        enableSorting: false,
      },
      {
        id: "evidence",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("platformAdmin.workspaces.evidence")}
          />
        ),
        cell: ({ row }) => <DeletionRecordEvidence record={row.original} />,
        enableHiding: false,
        enableSorting: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    columns,
    data,
    pageCount,
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <DataTable table={table}>
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
