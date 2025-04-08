import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { listAITriggers } from "@/features/integrations/ai-triggers/actions/list.action"
import { CreateAITriggerDialog } from "@/features/integrations/ai-triggers/create"
import { listAITriggersRequest } from "@/features/integrations/ai-triggers/schemas/get.schema"
import { AITriggersTable } from "@/features/integrations/ai-triggers/table"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AITriggersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listAITriggersRequest.parse(searchParams)
  const promises = Promise.all([
    listAITriggers({ ...search, chatbotId: params.chatbotId }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAITriggerDialog chatbotId={params.chatbotId} />
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
        <AITriggersTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
