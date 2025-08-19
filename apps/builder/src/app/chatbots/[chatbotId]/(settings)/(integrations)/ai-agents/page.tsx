import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getAIAgents } from "@/features/integrations/ai-agents/actions/list.action"
import { CreateAIAgentDialog } from "@/features/integrations/ai-agents/create"
import { listAIAgentRequest } from "@/features/integrations/ai-agents/schemas/list.schema"
import { AIAgentsTable } from "@/features/integrations/ai-agents/table"

export default async function AIAgentsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listAIAgentRequest.parse(searchParams)
  const promises = Promise.all([
    getAIAgents({ ...search, chatbotId: params.chatbotId }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateAIAgentDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense>
        <AIAgentsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
