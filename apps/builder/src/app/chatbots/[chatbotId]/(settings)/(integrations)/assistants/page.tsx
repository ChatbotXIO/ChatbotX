import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAssistantDialog } from "@/features/integrations/open-ai/assistant/create"
import { AssistantTable } from "@/features/integrations/open-ai/assistant/table"
import { getAssistants } from "@/features/integrations/open-ai/queries/assistant.query"
import { getAssistantSearchParamsCache } from "@/features/integrations/open-ai/schemas/assistant.schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function OpenAIAssistantPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAssistantSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAssistants({ ...search, chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAssistantDialog chatbotId={params.chatbotId} />
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
        <AssistantTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
