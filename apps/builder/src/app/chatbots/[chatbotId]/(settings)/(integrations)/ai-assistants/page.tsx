import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAiAssistantsDialog } from "@/features/integrations/open-ai/ai-assistants/create"
import { AiAssistantsTable } from "@/features/integrations/open-ai/ai-assistants/table"
import { getAiAssistants } from "@/features/integrations/open-ai/queries/ai-assistants.query"
import { getAiAssistantsSearchParamsCache } from "@/features/integrations/open-ai/schemas/ai-assistants.schema"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function OpenAIAssistantPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAiAssistantsSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAiAssistants({ ...search, chatbotId: params.chatbotId as string }),
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
