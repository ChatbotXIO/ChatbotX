"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@chatbotx.io/ui/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2Icon, MoreHorizontalIcon, XCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteWorkspaceMemberDialog } from "./components/delete-workspace-member"
import { InviteWorkspaceMemberDialog } from "./components/invite-workspace-member"
import { UpdateWorkspaceMemberDialog } from "./components/update-workspace-member"
import type { listWorkspaceMembers } from "./queries"
import type { ListWorkspaceMembersResponse } from "./schema/query"

type WorkspaceMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listWorkspaceMembers>>]>
}

export function WorkspaceMembersTable({
  promises,
}: WorkspaceMembersTableProps) {
  const [{ data, pageCount }] = use(promises)
  const t = useTranslations()

  const [rowAction, setRowAction] = useState<DataTableRowAction<
    ListWorkspaceMembersResponse["data"][number]
  > | null>(null)

  const columns = useMemo<
    ColumnDef<ListWorkspaceMembersResponse["data"][number]>[]
  >(
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
                src={row.original.user.image ?? undefined}
              />
              <AvatarFallback>
                {(row.original.user.name || "").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="max-w-[200px] truncate">
                  {row.original.user.name}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{row.original.user.name}</p>
              </TooltipContent>
            </Tooltip>
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
      // {
      //   id: "notificationTypes",
      //   header: ({ column }) => (
      //     <DataTableColumnHeader column={column} title="Notifications" />
      //   ),
      //   cell: ({ row }) =>
      //     isEnableAtLeastOneNotification(row.original.notificationTypes) ? (
      //       <CheckCircle2Icon className="size-5 text-green-500" />
      //     ) : (
      //       <XCircleIcon className="size-5" />
      //     ),
      //   enableHiding: false,
      // },
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
    <>
      <DataTable table={table}>
        <DataTableToolbar table={table}>
          <InviteWorkspaceMemberDialog />
        </DataTableToolbar>
      </DataTable>

      <DeleteWorkspaceMemberDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "delete"}
        workspaceMember={rowAction?.row.original || undefined}
      />

      <UpdateWorkspaceMemberDialog
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
        workspaceMember={rowAction?.row.original || null}
      />
    </>
  )
}
