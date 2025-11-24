import type { SearchParams } from "nuqs/server"
import { getAIAgents } from "@/features/ai-agents/actions/list.action"
import { AIAgentsTable } from "@/features/ai-agents/ai-agent-table"
import { listAIAgentRequest } from "@/features/ai-agents/schemas/list.schema"
import { getAIFiles } from "@/features/ai-files/queries"
import { getAIFunctions } from "@/features/ai-functions/queries"
import { AIHubBreadcrumb } from "@/features/ai-hub/ai-hub-breadcrumb"
import { getAIMcpServers } from "@/features/ai-mcp-servers/queries"

type AIAgentsPageProps = {
  params: Promise<{
    chatbotId: string
  }>
  searchParams: Promise<SearchParams>
}

export default async function AIAgentsPage(props: AIAgentsPageProps) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams

  const aiAgentPromises = Promise.all([
    getAIAgents({
      chatbotId,
      ...listAIAgentRequest.parse(searchParams),
    }),
  ])

  const aiCreatePromises = Promise.all([
    getAIFiles({
      chatbotId,
    }),
    getAIFunctions({
      chatbotId,
    }),
    getAIMcpServers({
      chatbotId,
    }),
  ])

  return (
    <div className="space-y-6">
      <AIHubBreadcrumb />
      <AIAgentsTable
        createPromises={aiCreatePromises}
        listPromises={aiAgentPromises}
      />
    </div>
  )
}
