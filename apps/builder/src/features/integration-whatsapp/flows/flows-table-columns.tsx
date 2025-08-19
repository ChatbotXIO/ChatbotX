"use client"

import type { WhatsappFlowModel } from "@aha.chat/database/types"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { TextIcon } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"

type GetColumnsProps = {
  setRowAction: Dispatch<
    SetStateAction<DataTableRowAction<WhatsappFlowModel> | null>
  >
}

export function getColumns({
  setRowAction: _setRowAction,
}: GetColumnsProps): ColumnDef<WhatsappFlowModel>[] {
  return [
    {
      id: "name",
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => <div>{row.original.name}</div>,
      size: 300,
      enableSorting: true,
      enableHiding: false,
      meta: {
        label: "Name",
        placeholder: "Search names...",
        variant: "text",
        icon: TextIcon,
      },
      enableColumnFilter: true,
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
      accessorKey: "completed",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Completed" />
      ),
      cell: ({ row }) => <div>{row.original.isCompleted.toString()}</div>,
      size: 300,
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
