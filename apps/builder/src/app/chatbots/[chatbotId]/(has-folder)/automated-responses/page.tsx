import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { listAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesSearchParams } from "@/features/automated-response/schemas/query"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params

  const searchParams = await props.searchParams
  const search = listAutomatedResponsesSearchParams.parse(searchParams)

  const promises = Promise.all([
    listAutomatedResponses({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <Suspense>
      <AutomatedResponsesTable chatbotId={chatbotId} promises={promises} />
    </Suspense>
  )
}
