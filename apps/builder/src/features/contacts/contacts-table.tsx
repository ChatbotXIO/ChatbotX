"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format, formatDistance } from "date-fns"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { use, useMemo } from "react"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { getUserName } from "../users/schemas/resource"
import { ContactListAction } from "./contacts-list-action"
import { CreateContactDialog } from "./create-contact-dialog"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ListContactsItem } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"

type ContactsTableProps = {
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({ workspaceId, promises }: ContactsTableProps) {
  const t = useTranslations()
  const [{ data, pageCount }] = use(promises)

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
          <div className="max-w-50 truncate">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  className="max-w-50 truncate"
                  href={`/space/${workspaceId}/inbox?conversationId=${row.original.conversation?.id}`}
                  target="_blank"
                >
                  {row.original.fullName}
                </Link>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.fullName}</p>
              </TooltipContent>
            </Tooltip>
          </div>
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
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.contactInboxes?.map((contactInbox) => (
              <InboxIcon
                channel={contactInbox.channel as ChannelType}
                key={contactInbox.id}
                showLabel={false}
              />
            ))}
          </div>
        ),
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
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="max-w-[200px] truncate">
                {getUserName(
                  row.original.conversation?.assignedUser,
                  t("assignAdmin.unAssigned"),
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {getUserName(
                row.original.conversation?.assignedUser,
                t("assignAdmin.unAssigned"),
              )}
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "lastReadAt",
        accessorKey: "lastReadAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.lastRead.label")}
          />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.conversation?.contactLastReadAt
              ? formatDistance(
                  new Date(),
                  row.original.conversation.contactLastReadAt,
                  {
                    addSuffix: true,
                  },
                )
              : null}
          </div>
        ),
        meta: {
          label: t("fields.lastRead.label"),
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
    [workspaceId, t],
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
      <DataTableToolbar table={table}>
        <CreateContactDialog workspaceId={workspaceId} />
        <ContactListAction table={table} workspaceId={workspaceId} />
      </DataTableToolbar>
    </DataTable>
  )
}
