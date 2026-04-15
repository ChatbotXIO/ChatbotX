import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AIAgentsTable } from "@/features/ai-agents/ai-agent-table"
import { listAIAgents } from "@/features/ai-agents/queries"
import { listAIAgentsRequest } from "@/features/ai-agents/schemas/query"
import { AITab } from "@/features/ai-hub/ai-hub-breadcrumb"

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

  return (
    <div className="space-y-6">
      <AITab />

      <Suspense>
        <AIAgentsTable promises={aiAgentPromises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
