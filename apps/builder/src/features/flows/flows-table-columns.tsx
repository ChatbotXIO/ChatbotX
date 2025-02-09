"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { formatDate } from "@/components/data-table/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import type { UpdateFlowSchema } from "@/features/flows/schemas/update-flow-schema"
import type { Flow } from "@ahachat.ai/database"
import type { ColumnDef, Row } from "@tanstack/react-table"
import { EllipsisVerticalIcon, TextIcon, Trash } from "lucide-react"
import Link from "next/link"
export interface DataTableRowAction<TData> {
  row: Row<TData>
  type: "update" | "delete"
}

type FlowWithContacts = Flow & {
  _count?: {
    contacts: number
  }
}

interface GetColumnsProps {
  setRowAction: React.Dispatch<
    React.SetStateAction<DataTableRowAction<Flow> | null>
  >
  update: (id: string, payload: UpdateFlowSchema) => void
}

export function getFlowColumns({
  setRowAction,
  update,
}: GetColumnsProps): ColumnDef<FlowWithContacts>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="translate-y-0.5"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-0.5"
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "title",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <Link
          href={`/chatbots/${row.original.chatbotId}/flows/${row.original.id}`}
        >
          {row.original.title}
        </Link>
      ),
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <Switch
          checked={row.original.isPublished}
          onCheckedChange={(value) =>
            update(row.original.id, { isPublished: value })
          }
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "enableInInbox",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Inbox" />
      ),
      cell: ({ row }) => (
        <Switch
          checked={row.original.enableInInbox}
          onCheckedChange={(value) =>
            update(row.original.id, { enableInInbox: value })
          }
        />
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "modified",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Modified" />
      ),
      cell: ({ row }) => <div>{formatDate(row.original.updatedAt)}</div>,
      size: 50,
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
                onSelect={() => setRowAction({ row, type: "update" })}
              >
                <TextIcon className="mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, type: "delete" })}
              >
                <Trash className="mr-2" />
                Delete
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
