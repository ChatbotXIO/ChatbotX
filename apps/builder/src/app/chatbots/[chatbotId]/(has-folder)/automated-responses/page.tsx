import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { listAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesSearchParams } from "@/features/automated-response/schema/query"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

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
