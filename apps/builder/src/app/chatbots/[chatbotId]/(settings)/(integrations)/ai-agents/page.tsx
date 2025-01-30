import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAgentDialog } from "@/features/integrations/open-ai/agents/create"
import { AgentsTable } from "@/features/integrations/open-ai/agents/table"
import { getAgents } from "@/features/integrations/open-ai/queries"
import { getAgentSearchParamsCache } from "@/features/integrations/open-ai/schemas/agents.schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function OpenAIAgentsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAgentSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAgents({ ...search, chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAgentDialog chatbotId={params.chatbotId} />
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
        <AgentsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
