"use client"

import type { AIAgentModel } from "@chatbotx.io/database/types"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteAIAgentsDialog } from "@/features/ai-agents/delete-ai-agent"
import type { listAIAgents } from "@/features/ai-agents/queries"
import { UpdateAIAgentDialog } from "@/features/ai-agents/update-ai-agent"
import type { listAIFiles } from "../ai-files/queries"
import type { listAIFunctions } from "../ai-functions/queries"
import type { listAIMcpServers } from "../ai-mcp-servers/queries"
import { ChangeDefault } from "./components/change-default"
import { CreateAIAgentDialog } from "./create-ai-agent"
import {
  type AIAgentDataTableRowAction,
  getAIAgentsColumns,
} from "./table-columns"

type AIAgentsTableProps = {
  workspaceId: string
  listPromises: Promise<[Awaited<ReturnType<typeof listAIAgents>>]>
  createPromises: Promise<
    [
      Awaited<ReturnType<typeof listAIFiles>>,
      Awaited<ReturnType<typeof listAIFunctions>>,
      Awaited<ReturnType<typeof listAIMcpServers>>,
    ]
  >
}

export function AIAgentsTable({
  workspaceId,
  listPromises,
  createPromises,
}: AIAgentsTableProps) {
  const [{ data, pageCount }] = use(listPromises)
  const [{ data: files }, { data: functions }, { data: mcpServers }] =
    use(createPromises)

  const t = useTranslations()
  const router = useRouter()

  const [rowAction, setRowAction] =
    useState<AIAgentDataTableRowAction<AIAgentModel> | null>(null)

  const columns = useMemo(
    () =>
      getAIAgentsColumns({
        setRowAction,
        t,
      }),
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
    getRowId: (originalRow: AIAgentModel) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">{t("aiAgent.name")}</CardTitle>
        <CardDescription>{t("aiAgent.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable table={table}>
          <DataTableToolbar table={table}>
            <CreateAIAgentDialog
              files={files}
              functions={functions}
              mcpServers={mcpServers}
              onSuccess={() => {
                router.refresh()
              }}
              workspaceId={workspaceId}
            />
          </DataTableToolbar>
        </DataTable>

        <DeleteAIAgentsDialog
          agents={rowAction?.row.original ? [rowAction?.row.original] : []}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            rowAction?.row.toggleSelected(false)
            router.refresh()
          }}
          open={rowAction?.variant === "delete"}
          showTrigger={false}
          workspaceId={workspaceId}
        />

        <UpdateAIAgentDialog
          agent={rowAction?.row.original || null}
          files={files}
          functions={functions}
          mcpServers={mcpServers}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "update"}
          workspaceId={workspaceId}
        />

        <ChangeDefault
          aiAgent={rowAction?.row.original || null}
          onOpenChange={() => setRowAction(null)}
          onSuccess={() => {
            router.refresh()
          }}
          open={rowAction?.variant === "toggleDefault"}
        />
      </CardContent>
    </Card>
  )
}
