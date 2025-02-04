import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAiAgentDialog } from "@/features/integrations/ai-agents/create"
import { getAiAgents } from "@/features/integrations/ai-agents/queries/get.query"
import { getAiAgentSearchParamsCache } from "@/features/integrations/ai-agents/schemas/get.schema"
import { AiAgentsTable } from "@/features/integrations/ai-agents/table"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function OpenAIAgentsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAiAgentSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAiAgents({ ...search, chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAiAgentDialog chatbotId={params.chatbotId} />
      </div>
      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={5}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "20rem", "40rem", "12rem", "10rem"]}
            shrinkZero
          />
        }
      >
        <AiAgentsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
