"use client"

import { DataTableColumnHeader } from "@/components/data-table-column-header"
import type { DataTableRowAction } from "@/types/data-table"
import type { WhatsappMessageTemplateModel } from "@aha.chat/database/types"
import type { ColumnDef } from "@tanstack/react-table"
import type { Dispatch, SetStateAction } from "react"

interface GetColumnsProps {
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
