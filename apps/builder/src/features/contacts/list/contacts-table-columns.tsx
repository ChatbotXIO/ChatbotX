"use client"

import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header"
import { Checkbox } from "@/components/ui/checkbox"
import { Contact } from "@prisma/client"
import { type ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"

export function getColumns(): ColumnDef<Contact>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "keyword",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Name" />
      ),
      cell: ({ row }) => {
        const fullName = [row.original.firstName, row.original.lastName].filter(v => !!v).join(" ")

        return <div>{fullName}</div>
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "source",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Source" />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "assignee",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Assigned" />
      ),
      cell: ({ row }) => {
        return <div>Unassigned</div>
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "lastSeenAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Last seen" />
      ),
      cell: ({ row }) => {
        return <div>{row.original.lastSeenAt ? formatDistance(new Date(), row.original.lastSeenAt, { addSuffix: true }) : null}</div>
      },
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd"),
      enableSorting: false,
      enableHiding: false,
    },
  ]
}
