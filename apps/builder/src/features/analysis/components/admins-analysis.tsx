"use client"

import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@aha.chat/ui/components/data-table/data-table-toolbar"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import type { ChatbotMemberResource } from "@/features/chatbot-members/schemas/resource"
import type { UserResource } from "@/features/users/schemas/resource"

type ChatBotMemberAnalysis = ChatbotMemberResource & {
  messagesSent: number
  contacts: number
  responseTime: number
  firstResponseTime: number
  assignedConversations: number
}

export function AdminsAnalysis() {
  const data = [
    {
      id: "1",
      user: {
        name: "John Doe",
      },
      messagesSent: 150,
      contacts: 75,
      responseTime: 30,
      firstResponseTime: 20,
      assignedConversations: 10,
    },
    {
      id: "2",
      user: {
        name: "Jane Smith",
      },
      messagesSent: 200,
      contacts: 100,
      responseTime: 25,
      firstResponseTime: 15,
      assignedConversations: 20,
    },
    {
      id: "3",
      user: {
        name: "Alice Johnson",
      },
      messagesSent: 180,
      contacts: 90,
      responseTime: 28,
      firstResponseTime: 18,
      assignedConversations: 15,
    },
  ] as unknown as ChatBotMemberAnalysis[]

  const columns = useMemo<ColumnDef<ChatBotMemberAnalysis>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <>
            <div>{(row.original.user as UserResource).name}</div>
          </>
        ),
        enableSorting: true,
        enableHiding: false,
      },
      {
        id: "messagesSent",
        accessorKey: "messagesSent",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Messages Sent" />
        ),
        enableSorting: true,
      },
      {
        id: "contacts",
        accessorKey: "contacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        enableSorting: true,
      },
      {
        id: "responseTime",
        accessorKey: "responseTime",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Avg. Response Time (mins)"
          />
        ),
        enableSorting: true,
      },
      {
        id: "firstResponseTime",
        accessorKey: "firstResponseTime",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Avg. First Response Time (mins)"
          />
        ),
        enableSorting: true,
      },
      {
        id: "assignedConversations",
        accessorKey: "assignedConversations",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Assigned Conversations"
          />
        ),
        enableSorting: true,
      },
    ],
    [],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount: 1,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="w-full">
      <DataTable table={table}>
        <DataTableToolbar table={table} />
      </DataTable>
    </div>
  )
}
