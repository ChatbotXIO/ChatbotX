import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAIAgentDialog } from "@/features/integrations/ai-agents/create"
import { getAIAgents } from "@/features/integrations/ai-agents/actions/list.action"
import { listAIAgentRequest } from "@/features/integrations/ai-agents/schemas/list.schema"
import { AIAgentsTable } from "@/features/integrations/ai-agents/table"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

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
      <div className="flex w-full justify-end mb-4">
        <CreateAIAgentDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={4}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "20rem", "40rem", "12rem"]}
            shrinkZero
          />
        }
      >
        <AIAgentsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
