"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { ListSubAccountWorkspacesResponse } from "../queries/list-sub-account-workspaces"
import {
  TransferWorkspaceDialog,
  type TransferWorkspaceTarget,
} from "./transfer-workspace-dialog"

type Row = ListSubAccountWorkspacesResponse["data"][number]

type SubAccountWorkspacesTableProps = {
  promises: Promise<[ListSubAccountWorkspacesResponse]>
}

function OwnerCell({ row }: { row: Row }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{row.ownerName ?? row.ownerEmail}</span>
      <span className="text-muted-foreground text-xs">{row.ownerEmail}</span>
    </div>
  )
}

export function SubAccountWorkspacesTable({
  promises,
}: SubAccountWorkspacesTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()
  const [target, setTarget] = useState<TransferWorkspaceTarget | null>(null)

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => row.original.name,
        meta: {
          label: t("fields.name.label"),
          placeholder: t("resellerWorkspaces.searchPlaceholder"),
          variant: "text",
          filterKey: "keyword",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "owner",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("resellerWorkspaces.owner")}
          />
        ),
        cell: ({ row }) => <OwnerCell row={row.original} />,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "PP"),
        enableSorting: false,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <Button
            onClick={() =>
              setTarget({
                id: row.original.id,
                name: row.original.name,
                ownerEmail: row.original.ownerEmail,
              })
            }
            size="sm"
            variant="outline"
          >
            {t("resellerWorkspaces.moveAction")}
          </Button>
        ),
        enableHiding: false,
      },
    ],
    [t],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["actions"] } },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
      <TransferWorkspaceDialog
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null)
          }
        }}
        target={target}
      />
    </>
  )
}
