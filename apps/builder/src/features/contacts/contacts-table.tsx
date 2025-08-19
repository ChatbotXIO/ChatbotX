"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"
import { use, useMemo } from "react"
import { ContactListAction } from "./contacts-list-action"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ContactResource } from "./schemas"

type ContactsTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({ chatbotId, promises }: ContactsTableProps) {
  const [{ data, pageCount }] = use(promises)

  const columns = useMemo<ColumnDef<ContactResource>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label="Select all"
            checked={
              innerTable.getIsAllPageRowsSelected() ||
              (innerTable.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label="Select row"
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "keyword",
        accessorKey: "keyword",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => {
          return <div>{row.original.fullName}</div>
        },
        meta: {
          label: "Name",
          placeholder: "Search name...",
          variant: "text",
        },
        enableColumnFilter: true,
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
          <DataTableColumnHeader column={column} title="Assignee" />
        ),
        cell: ({ row }) => {
          return (
            <div>
              {row.original.conversation?.assignedUser?.name ||
                row.original.conversation?.assignedInboxTeam?.name ||
                "Unassigned"}
            </div>
          )
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
    <DataTable table={table}>
      <DataTableToolbar className="flex gap-1.5" table={table}>
        <ContactListAction chatbotId={chatbotId} table={table} />
      </DataTableToolbar>
    </DataTable>
  )
}
