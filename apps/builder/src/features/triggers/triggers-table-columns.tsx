"use client"

import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { Switch } from "@aha.chat/ui/components/ui/switch"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import type { useTranslations } from "next-intl"
import type { Dispatch, SetStateAction } from "react"
import type { TriggerResource } from "./schemas"

type GetColumnsProps = {
  chatbotId: string
  t: ReturnType<typeof useTranslations>
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<TriggerResource> | null>
  >
}

export function getColumns({
  chatbotId,
  t,
  setRowAction,
}: GetColumnsProps): ColumnDef<TriggerResource>[] {
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
      size: 20,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t("fields.name.label")} />
      ),
      cell: ({ row }) => (
        <Link href={`/chatbots/${chatbotId}/triggers/${row.original.id}/edit`}>
          {row.original.name}
        </Link>
      ),
      size: 50,
      meta: {
        label: t("fields.name.label"),
        placeholder: t("fields.name.placeholder"),
        variant: "text",
      },
      enableColumnFilter: true,
      enableSorting: true,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={t("fields.status.label")}
        />
      ),
      cell: ({ row }) => (
        <Switch
          checked={row.original.active}
          onCheckedChange={(_value) => {
            // TODO
          }}
        />
      ),
      meta: {
        label: t("fields.status.label"),
      },
      size: 400,
      enableSorting: true,
    },

    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onSelect={() => setRowAction({ row, variant: "delete" })}
            >
              Delete
              <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
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
