"use client"

import { DataTable } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import type { DataTableRowAction } from "@/components/data-table/types"
import { useDataTable } from "@/hooks/use-data-table"
import { useTranslate } from "@tolgee/react"
import { use, useMemo, useState } from "react"
import { getColumns } from "./chatbot-members-table-columns"
import type { getAgents } from "./queries"
import type { ChatbotMemberWithUser } from "./schemas/add-chatbot-member-schema"

type ChatbotMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof getAgents>>]>
}

export function ChatbotMembersTable({ promises }: ChatbotMembersTableProps) {
  const { t } = useTranslate()
  const [{ data, pageCount }] = use(promises)

  const [_rowAction, setRowAction] =
    useState<DataTableRowAction<ChatbotMemberWithUser> | null>(null)

  const titles: Record<
    "name" | "contacts" | "analytics" | "flows" | "settings" | "notifications",
    string
  > = {
    name: t("chatbotMembers.name"),
    contacts: t("chatbotMembers.contacts"),
    analytics: t("chatbotMembers.analytics"),
    flows: t("chatbotMembers.flows"),
    settings: t("chatbotMembers.settings"),
    notifications: t("chatbotMembers.notifications"),
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const columns = useMemo(() => {
    return getColumns({ titles, setRowAction })
    // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  }, [setRowAction, titles])

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
