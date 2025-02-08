import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAiAssistantsDialog } from "@/features/integrations/ai-assistants/create"
import {
  getAiAssistantFiles,
  getAiAssistants,
} from "@/features/integrations/ai-assistants/queries/get.query"
import { getAiAssistantsSearchParamsCache } from "@/features/integrations/ai-assistants/schemas/get.schema"
import { AiAssistantsTable } from "@/features/integrations/ai-assistants/table"
import {
  getOpenAIModels,
  getOpenAITriggers,
} from "@/features/integrations/open-ai/queries"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AIAssistantsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAiAssistantsSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAiAssistants({ ...search, chatbotId: params.chatbotId as string }),
    getOpenAIModels(),
    getOpenAITriggers(),
    getAiAssistantFiles({ chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAiAssistantsDialog chatbotId={params.chatbotId} />
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
        <AiAssistantsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
