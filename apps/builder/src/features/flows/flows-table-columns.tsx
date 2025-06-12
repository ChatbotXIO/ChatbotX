"use client"

import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { formatDate } from "@/lib/format"
import type { DataTableRowAction } from "@/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { EllipsisVerticalIcon, TextIcon, Trash } from "lucide-react"
import { useAction } from "next-safe-action/hooks"
import Link from "next/link"
import type { Dispatch, SetStateAction } from "react"
import { updateFlowAction } from "./actions/update-flow-action"
import type { FlowResource } from "./schemas/get-flows-schema"

interface GetColumnsProps {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FlowResource> | null>
  >
}

export function getFlowColumns({
  setRowAction,
}: GetColumnsProps): ColumnDef<FlowResource>[] {
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
          {row.original.name}
        </Link>
      ),
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "active",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const { execute, isPending } = useAction(
          updateFlowAction.bind(null, row.original.chatbotId, row.original.id),
          {
            onSuccess: () => {
              row.original.active = !row.original.active
            },
          },
        )
        return (
          <Switch
            disabled={isPending}
            checked={row.original.active}
            onCheckedChange={(value) => {
              execute({ active: value })
            }}
          />
        )
      },
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "enableInInbox",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Inbox" />
      ),
      cell: ({ row }) => {
        const { execute, isPending } = useAction(
          updateFlowAction.bind(null, row.original.chatbotId, row.original.id),
          {
            onSuccess: () => {
              row.original.enableInInbox = !row.original.enableInInbox
            },
          },
        )

        return (
          <Switch
            disabled={isPending}
            checked={row.original.enableInInbox}
            onCheckedChange={(value) => {
              execute({ enableInInbox: value })
            }}
          />
        )
      },
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
                onSelect={() => setRowAction({ row, variant: "rename" })}
              >
                <TextIcon className="mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setRowAction({ row, variant: "delete" })}
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
