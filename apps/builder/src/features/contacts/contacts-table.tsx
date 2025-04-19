"use client"

import { DataTable } from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import { Checkbox } from "@/components/ui/checkbox"
import { useDataTable } from "@/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"
import { use, useMemo } from "react"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ContactResource } from "./schemas/get-contacts-schema"

interface ContactsTableProps {
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({ promises }: ContactsTableProps) {
  const [{ data, pageCount }] = use(promises)

  const columns = useMemo<ColumnDef<ContactResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => {
          const fullName = [row.original.firstName, row.original.lastName]
            .filter((v) => v)
            .join(" ")

          return <div>{fullName}</div>
        },
      },
      {
        accessorKey: "source",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader column={column} title="Source" />
        ),
        cell: ({ cell }) => (
          <div>{cell.getValue<ContactResource["source"]>()}</div>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "assignee",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Assigned To" />
        ),
        cell: () => {
          return <div>Unassigned</div>
        },
        enableSorting: false,
      },
      {
        accessorKey: "lastSeenAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Last seen" />
        ),
        cell: ({ row }) => {
          return (
            <div>
              {row.original.lastSeenAt
                ? formatDistance(new Date(), row.original.lastSeenAt, {
                    addSuffix: true,
                  })
                : null}
            </div>
          )
        },
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Created" />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd"),
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
        <DataTableToolbar table={table} />
      </DataTable>
    </>
  )
}
