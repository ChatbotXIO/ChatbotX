"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { ContactListAction } from "./contacts-list-action"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ContactResource } from "./schemas/resource"
import { getFullName } from "./utils"

type ContactsTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({ chatbotId, promises }: ContactsTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()

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
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="text-blue-500"
            href={`/chatbots/${chatbotId}/inbox?conversationId=${row.original.conversation?.id}`}
            target="_blank"
          >
            {getFullName(row.original)}
          </Link>
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
        },
        enableColumnFilter: true,
      },
      {
        accessorKey: "source",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.source.label")}
          />
        ),
        cell: ({ cell }) => (
          <div>{cell.getValue<ContactResource["source"]>()}</div>
        ),
        enableSorting: false,
        meta: {
          label: t("fields.source.label"),
        },
      },
      {
        accessorKey: "assignee",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.assignee.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.conversation?.assignedUser?.name ||
              row.original.conversation?.assignedInboxTeam?.name ||
              "Unassigned"}
          </div>
        ),
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
      },
      {
        id: "lastSeenAt",
        accessorKey: "lastSeenAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.lastSeen.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.lastSeenAt
              ? formatDistance(new Date(), row.original.lastSeenAt, {
                  addSuffix: true,
                })
              : null}
          </div>
        ),
        meta: {
          label: t("fields.lastSeen.label"),
        },
        enableSorting: true,
      },
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd"),
        meta: {
          label: t("fields.createdAt.label"),
        },
        enableSorting: true,
      },
    ],
    [chatbotId, t],
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
