"use client"

import { DataTable } from "@/components/data-table"
import { DataTableColumnHeader } from "@/components/data-table-column-header"
import { DataTableToolbar } from "@/components/data-table-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useDataTable } from "@/hooks/use-data-table"
import type { DataTableRowAction } from "@/types/data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { CheckCircle2Icon, MoreHorizontalIcon, XCircleIcon } from "lucide-react"
import { use, useMemo, useState } from "react"
import type { getAgents } from "./queries"
import type { ChatbotMemberWithUser } from "./schemas/add-chatbot-member-schema"

type ChatbotMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getAgents>>]>
}

export function ChatbotMembersTable({ promises }: ChatbotMembersTableProps) {
  const [{ data, pageCount }] = use(promises)

  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<ChatbotMemberWithUser> | null>(null)

  const columns = useMemo<ColumnDef<ChatbotMemberWithUser>[]>(() => {
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
        cell: ({ row }) => <div>{row.original.user.name}</div>,
      },
      {
        id: "enableContacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        cell: ({ cell }) => {
          return cell.getValue<ChatbotMemberWithUser["enableContacts"]>() ? (
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
          return cell.getValue<ChatbotMemberWithUser["enableAnalytics"]>() ? (
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
          return cell.getValue<ChatbotMemberWithUser["enableFlows"]>() ? (
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
          return cell.getValue<ChatbotMemberWithUser["isAdmin"]>() ? (
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
            ChatbotMemberWithUser["enableEmailAndPhone"]
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
                <Button variant="ghost" size="icon">
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
