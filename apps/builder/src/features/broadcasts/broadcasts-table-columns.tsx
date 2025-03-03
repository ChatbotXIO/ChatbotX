"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { formatDate } from "@/components/data-table/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Broadcast } from "@ahachat.ai/database"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { EllipsisVerticalIcon, SendIcon, TextIcon } from "lucide-react"
import type { BroadcastResource } from "./schemas/get-broadcasts-schema"

export interface DataTableRowAction<TData> {
  row: Row<TData>
  type: "rename" | "resend"
  value?: unknown
}

interface GetColumnsProps {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Broadcast> | null>
  >
}

export function getColumns({
  setRowAction,
}: GetColumnsProps): ColumnDef<BroadcastResource>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => <div>{row.original.name}</div>,
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "channel",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Channel" />
      ),
      cell: ({ row }) => <div>{row.original.inboxType ?? "Omnichannel"}</div>,
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <div>{row.original.status}</div>,
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "estimated",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Estimated contact" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "sent",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Sent" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "delivered",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Delivered" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "seen",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Seen" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "clicked",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Clicked" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "failed",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Failed" />
      ),
      cell: ({ row }) => <div>{row.original._count?.contacts ?? 0}</div>,
      size: 50,
      enableSorting: false,
      enableHiding: false,
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
              <Button
                aria-label="Open menu"
                variant="ghost"
                className="flex size-8 p-0 data-[state=open]:bg-muted"
              >
                <EllipsisVerticalIcon className="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, type: "rename" })}
              >
                <TextIcon className="mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, type: "resend" })}
              >
                <SendIcon className="mr-2" />
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
  ]
}
