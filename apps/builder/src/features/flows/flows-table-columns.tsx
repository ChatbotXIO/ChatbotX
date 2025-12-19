"use client"

import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import { formatDate } from "@aha.chat/ui/lib/format"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import {
  EllipsisVerticalIcon,
  FolderUpIcon,
  TextIcon,
  Trash,
} from "lucide-react"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import type { Dispatch, SetStateAction } from "react"
import { updateFlowAction } from "./actions/update-flow-action"
import type { FlowResource } from "./schemas/get-flows-schema"

type GetColumnsProps = {
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<FlowResource> | null>
  >
}

export function getFlowColumns({
  t,
  setRowAction,
}: GetColumnsProps): ColumnDef<FlowResource>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          className="translate-y-0.5"
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(Boolean(value))
          }
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          className="translate-y-0.5"
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
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
            checked={row.original.active}
            disabled={isPending}
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
            checked={row.original.enableInInbox}
            disabled={isPending}
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
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label="Open menu"
              className="flex size-8 p-0 data-[state=open]:bg-muted"
              variant="ghost"
            >
              <EllipsisVerticalIcon aria-hidden="true" className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "rename" })}
            >
              <TextIcon />
              {t("actions.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "move" })}
            >
              <FolderUpIcon />
              {t("actions.move")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "delete" })}
              variant="destructive"
            >
              <Trash />
              {t("actions.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      size: 50,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
