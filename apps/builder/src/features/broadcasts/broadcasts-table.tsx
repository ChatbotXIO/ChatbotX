"use client"

import { DataTable } from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { listBroadcasts } from "@/features/broadcasts/queries"
import { useDataTable } from "@/hooks/use-data-table"
import { formatDate } from "@/lib/format"
import type { DataTableRowAction } from "@/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon } from "lucide-react"
import React, { useMemo, useState } from "react"
import { RenameBroadcastDialog } from "./rename-broadcast-dialog"
import type { BroadcastResource } from "./schemas/get-broadcasts-schema"

interface BroadcastsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listBroadcasts>>]>
}

export function BroadcastsTable({ promises }: BroadcastsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const [rowAction, setRowAction] =
    useState<DataTableRowAction<BroadcastResource> | null>(null)

  const columns = useMemo<ColumnDef<BroadcastResource>[]>(
    () => [
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ cell }) => (
          <div>{cell.getValue<BroadcastResource["name"]>()}</div>
        ),
      },
      {
        id: "channel",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Channel" />
        ),
        cell: ({ cell }) => (
          <div>{cell.getValue<BroadcastResource["inboxType"]>()}</div>
        ),
      },
      {
        id: "status",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Status" />
        ),
        cell: ({ cell }) => (
          <div>{cell.getValue<BroadcastResource["status"]>()}</div>
        ),
      },
      {
        accessorKey: "estimatedContacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Estimated contact" />
        ),
        cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      },
      {
        accessorKey: "schedulesAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Date" />
        ),
        cell: ({ row }) => <div>{formatDate(row.original.schedulesAt)}</div>,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontalIcon className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "rename" })}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "resend" })}
                >
                  Resend
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        size: 50,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>

      <RenameBroadcastDialog
        open={rowAction?.variant === "rename"}
        onOpenChange={() => setRowAction(null)}
        broadcast={rowAction?.row.original || null}
      />
    </>
  )
}
