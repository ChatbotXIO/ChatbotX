"use client"

import type { WhatsappMessageTemplateModel } from "@aha.chat/database/types"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import type { Dispatch, SetStateAction } from "react"

type GetColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<WhatsappMessageTemplateModel> | null>
  >
}

export function getColumns({
  setRowAction: _setRowAction,
}: GetColumnsProps): ColumnDef<WhatsappMessageTemplateModel>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => <div>{row.original.name}</div>,
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "language",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Language" />
      ),
      cell: ({ row }) => <div>{row.original.language}</div>,
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "category",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Category" />
      ),
      cell: ({ row }) => <div>{row.original.category}</div>,
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => <div>{row.original.status}</div>,
      size: 300,
      enableSorting: true,
      enableHiding: false,
    },
  ]
}
