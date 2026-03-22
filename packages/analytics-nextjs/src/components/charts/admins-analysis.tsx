"use client"

import type { ChatbotMemberModel, UserModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@aha.chat/ui/components/data-table/data-table-column-header"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { ColumnDef } from "@aha.chat/ui/types/data-table"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

type AdminsAnalysisData = ChatbotMemberModel & {
  messagesSent: number
  contacts: number
  responseTime: number
  firstResponseTime: number
  assignedConversations: number
  user: UserModel
}

export function AdminsAnalysis() {
  const t = useTranslations()

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
  ] as unknown as AdminsAnalysisData[]

  const columns = useMemo<ColumnDef<AdminsAnalysisData>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <>
            <div>{(row.original.user as UserModel).name}</div>
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
        enableHiding: false,
      },
      {
        id: "contacts",
        accessorKey: "contacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        enableSorting: true,
        enableHiding: false,
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
        enableHiding: false,
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
        enableHiding: false,
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
        enableHiding: false,
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
    <Card className="col-span-2 w-full">
      <CardHeader>
        <CardTitle>{t("analytics.admins")}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable table={table} />
      </CardContent>
    </Card>
  )
}
