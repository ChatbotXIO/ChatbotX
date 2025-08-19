"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
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
import { use, useMemo, useState } from "react"
import type { getAgents } from "./queries"
import type { ChatbotMemberResource } from "./schemas"

type ChatbotMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getAgents>>]>
}

export function ChatbotMembersTable({ promises }: ChatbotMembersTableProps) {
  const [{ data, pageCount }] = use(promises)

  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<ChatbotMemberResource> | null>(null)

  const columns = useMemo<ColumnDef<ChatbotMemberResource>[]>(() => {
    return [
      {
        id: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        // <Avatar className="justify-items-center w-5 h-5">
        //         <AvatarImage
        //           src={row.original.user.image ?? undefined}
        //           alt="avatar"
        //         />
        //         <AvatarFallback>
        //           {(row.original.user.name ?? "").charAt(0).toUpperCase()}
        //         </AvatarFallback>
        //       </Avatar>
        cell: ({ row }) => <div>{row.original.user?.name}</div>,
      },
      {
        id: "enableContacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<ChatbotMemberResource["enableContacts"]>() ? (
            <CheckCircle2Icon />
          ) : (
            <XCircleIcon />
          )
        },
      },
      {
        id: "enableAnalytics",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Analytics" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<ChatbotMemberResource["enableAnalytics"]>() ? (
            <CheckCircle2Icon />
          ) : (
            <XCircleIcon />
          )
        },
      },
      {
        id: "enableFlows",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Flows" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<ChatbotMemberResource["enableFlows"]>() ? (
            <CheckCircle2Icon />
          ) : (
            <XCircleIcon />
          )
        },
      },
      {
        id: "settings",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Flows" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<ChatbotMemberResource["isAdmin"]>() ? (
            <CheckCircle2Icon />
          ) : (
            <XCircleIcon />
          )
        },
      },
      {
        id: "notifications",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Notifications" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<
            ChatbotMemberResource["enableEmailAndPhone"]
          >() ? (
            <CheckCircle2Icon />
          ) : (
            <XCircleIcon />
          )
        },
      },
      {
        id: "actions",
        cell: ({ row }) => {
          return (
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
                  Update
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setRowAction({ row, variant: "delete" })}
                  variant="destructive"
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ]
  }, [])

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
      <DataTableToolbar table={table} />
    </DataTable>
  )
}
