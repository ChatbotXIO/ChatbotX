import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton"
import { CreateAiTriggerDialog } from "@/features/integrations/ai-triggers/create";
import { getAiTriggers } from "@/features/integrations/ai-triggers/queries/get.query";
import { getAiTriggerSearchParamsCache } from "@/features/integrations/ai-triggers/schemas/get.schema";
import { AiTriggersTable } from "@/features/integrations/ai-triggers/table";
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function AITriggersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getAiTriggerSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getAiTriggers({ ...search, chatbotId: params.chatbotId as string }),
  ])

  return (
    <>
      <div className="flex w-full justify-end mb-4">
        <CreateAiTriggerDialog chatbotId={params.chatbotId} />
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
        <AiTriggersTable promises={promises} chatbotId={params.chatbotId} />
      </Suspense>
    </>
  )
}
