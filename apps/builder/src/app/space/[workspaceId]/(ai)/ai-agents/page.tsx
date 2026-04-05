import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AIAgentsTable } from "@/features/ai-agents/ai-agent-table"
import { listAIAgents } from "@/features/ai-agents/queries"
import { listAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import { listAIFiles } from "@/features/ai-files/queries"
import { listAIFunctions } from "@/features/ai-functions/queries"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"
import { listAIMcpServers } from "@/features/ai-mcp-servers/queries"

type AIAgentsPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}

export default async function AIAgentsPage(props: AIAgentsPageProps) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams

  const aiAgentPromises = Promise.all([
    listAIAgents({
      workspaceId,
      ...listAIAgentsRequest.parse(searchParams),
    }),
  ])

  const aiCreatePromises = Promise.all([
    listAIFiles({
      workspaceId,
    }),
    listAIFunctions({
      workspaceId,
    }),
    listAIMcpServers({
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <AIAgentsTable
          createPromises={aiCreatePromises}
          listPromises={aiAgentPromises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
