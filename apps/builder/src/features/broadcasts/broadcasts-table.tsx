"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import { formatDate } from "@aha.chat/ui/lib/format"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontalIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import React, { useMemo, useState } from "react"
import type { listBroadcasts } from "@/features/broadcasts/queries"
import { RenameBroadcastDialog } from "./rename-broadcast-dialog"
import type { BroadcastResource } from "./schemas/get-broadcasts-schema"

type BroadcastsTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listBroadcasts>>]>
}

export function BroadcastsTable({ promises }: BroadcastsTableProps) {
  const [{ data, pageCount }] = React.use(promises)
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

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
                <Button size="icon" variant="ghost">
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
        <DataTableToolbar table={table}>
          <div className="flex justify-end">
            <Button asChild size="sm">
              <Link href={`/chatbots/${chatbotId}/broadcasts/create`}>
                <PlusIcon />
                {t("actions.createFeature", {
                  feature: t("fields.broadcast.label"),
                })}
              </Link>
            </Button>
          </div>
        </DataTableToolbar>
      </DataTable>

      <RenameBroadcastDialog
        broadcast={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "rename"}
      />
    </>
  )
}
