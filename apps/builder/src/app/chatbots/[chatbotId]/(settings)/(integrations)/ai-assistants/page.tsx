import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAIAssistantsDialog } from "@/features/integrations/ai-assistants/create"
import {
  getAIAssistantFiles,
  getAIAssistants,
} from "@/features/integrations/ai-assistants/queries/get.query"
import { getAIAssistantsSearchParamsCache } from "@/features/integrations/ai-assistants/schemas/get.schema"
import { AIAssistantsTable } from "@/features/integrations/ai-assistants/table"
import { getAITriggers } from "@/features/integrations/ai-triggers/queries/get.query"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AIAssistantsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAIAssistantsSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAIAssistants({ ...search, chatbotId: params.chatbotId as string }),
    getAITriggers({ chatbotId: params.chatbotId as string }),
    getAIAssistantFiles({ chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAIAssistantsDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense
        fallback={
          <DataTableSkeleton
            columnCount={4}
            searchableColumnCount={1}
            filterableColumnCount={2}
            cellWidths={["10rem", "20rem", "40rem", "12rem", "10rem"]}
            shrinkZero
          />
        }
      >
        <AIAssistantsTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
