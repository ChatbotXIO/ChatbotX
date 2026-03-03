"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2Icon, MoreHorizontalIcon, XCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteChatbotMemberDialog } from "./components/delete-chatbot-member"
import { InviteChatbotMemberDialog } from "./components/invite-chatbot-member"
import { UpdateChatbotMemberDialog } from "./components/update-chatbot-member"
import { isEnableAtLeastOneNotification } from "./helpers"
import type { getAgents } from "./queries"
import type { ChatbotMemberResource } from "./schemas/resource"

type ChatbotMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getAgents>>]>
}

export function ChatbotMembersTable({ promises }: ChatbotMembersTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<ChatbotMemberResource> | null>(null)

  const columns = useMemo<ColumnDef<ChatbotMemberResource>[]>(
    () => [
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Avatar className="size-7 justify-items-center">
              <AvatarImage
                alt="avatar"
                src={row.original.user?.image ?? undefined}
              />
              <AvatarFallback>
                {(row.original.user?.name || "").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <span>{row.original.user?.name}</span>
          </div>
        ),
        enableHiding: false,
      },
      {
        id: "enableContacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        cell: ({ row }) =>
          row.original.permissions.contacts ? (
            <CheckCircle2Icon className="size-5 text-green-500" />
          ) : (
            <XCircleIcon className="size-5" />
          ),
        enableHiding: false,
      },
      {
        id: "enableAnalytics",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Analytics" />
        ),
        cell: ({ row }) =>
          row.original.permissions.analytics ? (
            <CheckCircle2Icon className="size-5 text-green-500" />
          ) : (
            <XCircleIcon className="size-5" />
          ),
        enableHiding: false,
      },
      {
        id: "enableFlows",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Flows" />
        ),
        cell: ({ row }) =>
          row.original.permissions.flows ? (
            <CheckCircle2Icon className="size-5 text-green-500" />
          ) : (
            <XCircleIcon className="size-5" />
          ),
        enableHiding: false,
      },
      {
        id: "flows",
        className: "justify-center",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Flows" />
        ),
        cell: ({ row }) =>
          row.original.permissions.flows ? (
            <CheckCircle2Icon className="size-5 text-green-500" />
          ) : (
            <XCircleIcon className="size-5" />
          ),
        enableHiding: false,
      },
      {
        id: "notificationTypes",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Notifications" />
        ),
        cell: ({ row }) =>
          isEnableAtLeastOneNotification(row.original.notificationTypes) ? (
            <CheckCircle2Icon className="size-5 text-green-500" />
          ) : (
            <XCircleIcon className="size-5" />
          ),
        enableHiding: false,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost">
                <MoreHorizontalIcon className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "update" })}
              >
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setRowAction({ row, variant: "delete" })}
                variant="destructive"
              >
                {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableHiding: false,
      },
    ],
    [t],
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
    <div className="flex flex-col gap-4">
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <InviteChatbotMemberDialog />
        </DataTableToolbar>
      </DataTable>

      <DeleteChatbotMemberDialog
        chatbotMember={rowAction?.row.original || undefined}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "delete"}
      />

      <UpdateChatbotMemberDialog
        chatbotMember={rowAction?.row.original || null}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
      />
    </div>
  )
}
