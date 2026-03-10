"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Checkbox } from "@aha.chat/ui/components/ui/checkbox"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { useConfiguredInboxTypeOptions } from "../inboxes/provider/inbox-hook"
import { getUserName } from "../users/schemas/resource"
import { ContactListAction } from "./contacts-list-action"
import { CreateContactDialog } from "./create-contact-dialog"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ListContactsItem } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"
import { getFullName } from "./utils"

type ContactsTableProps = {
  chatbotId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({ chatbotId, promises }: ContactsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)

  const channelOptions = useConfiguredInboxTypeOptions()

  const columns = useMemo<ColumnDef<ListContactsItem>[]>(
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
        enableHiding: false,
      },
      {
        accessorKey: "source",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.source.label")}
          />
        ),
        cell: ({ row }) => {
          const channel = channelOptions.find(
            (option) => option.value === row.original.source,
          )
          return <div>{channel ? channel.label : ""}</div>
        },
        enableSorting: false,
        enableHiding: false,
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
            {getUserName(
              row.original.conversation?.assignedUser,
              t("assignAdmin.unAssigned"),
            )}
          </div>
        ),
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
        enableHiding: false,
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
            {row.original.conversation?.contactLastSeenAt
              ? formatDistance(
                  new Date(),
                  row.original.conversation.contactLastSeenAt,
                  {
                    addSuffix: true,
                  },
                )
              : null}
          </div>
        ),
        meta: {
          label: t("fields.lastSeen.label"),
        },
        enableSorting: true,
        enableHiding: false,
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
        enableHiding: false,
      },
    ],
    [chatbotId, t, channelOptions],
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
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("contacts.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <CreateContactDialog chatbotId={chatbotId} />
            <ContactListAction chatbotId={chatbotId} table={table} />
          </DataTableToolbar>
        </DataTable>
      </CardContent>
    </Card>
  )
}
