"use client"

import type { AIAgentModel } from "@aha.chat/database/types"
import { DataTable } from "@aha.chat/ui/components/data-table/data-table"
import { useDataTable } from "@aha.chat/ui/hooks/use-data-table"
import type { DataTableRowAction } from "@aha.chat/ui/types/data-table"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { getAIAgents } from "@/features/ai-agents/actions/list.action"
import { DeleteAIAgentsDialog } from "@/features/ai-agents/delete-ai-agent"
import { UpdateAIAgentDialog } from "@/features/ai-agents/update-ai-agent"
import type { getAIFiles } from "../ai-files/queries"
import type { getAIFunctions } from "../ai-functions/queries"
import type { getAIMcpServers } from "../ai-mcp-servers/queries"
import { CreateAIAgentDialog } from "./create-ai-agent"
import { GetAIAgentsColumns } from "./table-columns"

type AIAgentsTableProps = {
  listPromises: Promise<[Awaited<ReturnType<typeof getAIAgents>>]>
  createPromises: Promise<
    [
      Awaited<ReturnType<typeof getAIFiles>>,
      Awaited<ReturnType<typeof getAIFunctions>>,
      Awaited<ReturnType<typeof getAIMcpServers>>,
    ]
  >
}

export function AIAgentsTable({
  listPromises,
  createPromises,
}: AIAgentsTableProps) {
  const [{ data, pageCount }] = use(listPromises)
  const [{ data: files }, { data: functions }, { data: mcpServers }] =
    use(createPromises)
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const t = useTranslations()
  // const router = useRouter()

  const [rowAction, setRowAction] =
    useState<DataTableRowAction<AIAgentModel> | null>(null)

  // const { execute } = useAction(
  //   duplicateAIAgentAction.bind(
  //     null,
  //     chatbotId,
  //     rowAction?.row.original ? rowAction.row.original.id : "",
  //   ),
  // )

  // useEffect(() => {
  //   if (rowAction && rowAction.variant === "duplicate") {
  //     execute()
  //     setRowAction(null)
  //     toast.success("Duplicate successfully!")
  //     router.refresh()
  //   }
  // }, [rowAction, execute, router])

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  const columns = useMemo(
    () => GetAIAgentsColumns({ setRowAction }),
    [setRowAction],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow: AIAgentModel) => originalRow.id as string,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-lg">{t("aiAgent.title")}</h3>
          <p className="text-muted-foreground text-sm">
            {t("aiAgent.description")}
          </p>
        </div>
        <CreateAIAgentDialog
          files={files}
          functions={functions}
          mcpServers={mcpServers}
        />
      </div>

      <DataTable table={table} />

      <DeleteAIAgentsDialog
        agents={rowAction?.row.original ? [rowAction?.row.original] : []}
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        onSuccess={() => rowAction?.row.toggleSelected(false)}
        open={rowAction?.variant === "delete"}
        showTrigger={false}
      />

      <UpdateAIAgentDialog
        agent={rowAction?.row.original || null}
        chatbotId={chatbotId}
        onOpenChange={() => setRowAction(null)}
        open={rowAction?.variant === "update"}
      />
    </div>
  )
}
