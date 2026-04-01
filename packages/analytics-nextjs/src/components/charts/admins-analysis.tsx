"use client"

import type { HumanAgentStats } from "@chatbotx.io/analytics"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@chatbotx.io/ui/types/data-table"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAnalysisStore } from "../../provider/analysis-store-context"

type AdminsAnalysisData = HumanAgentStats

export function AdminsAnalysis() {
  const t = useTranslations()
  const humanAgentStats = useAnalysisStore((state) => state.humanAgentStats)

  const data = useMemo(() => humanAgentStats, [humanAgentStats])

  const columns = useMemo<ColumnDef<AdminsAnalysisData>[]>(
    () => [
      {
        id: "name",
        accessorKey: "userName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Name" />
        ),
        cell: ({ row }) => (
          <div>
            {row.original.userName ||
              row.original.userEmail ||
              row.original.adminId}
          </div>
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
        id: "uniqueContacts",
        accessorKey: "uniqueContacts",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Contacts" />
        ),
        enableSorting: true,
        enableHiding: false,
      },
      // {
      //   id: "responseTime",
      //   accessorKey: "responseTime",
      //   header: ({ column }) => (
      //     <DataTableColumnHeader
      //       column={column}
      //       title="Avg. Response Time (mins)"
      //     />
      //   ),
      //   enableSorting: true,
      //   enableHiding: false,
      // },
      // {
      //   id: "firstResponseTime",
      //   accessorKey: "firstResponseTime",
      //   header: ({ column }) => (
      //     <DataTableColumnHeader
      //       column={column}
      //       title="Avg. First Response Time (mins)"
      //     />
      //   ),
      //   enableSorting: true,
      //   enableHiding: false,
      // },
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
      sorting: [{ id: "messagesSent", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.adminId,
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
