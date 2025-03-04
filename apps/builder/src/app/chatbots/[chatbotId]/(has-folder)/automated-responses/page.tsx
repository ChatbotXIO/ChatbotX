import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { getAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesNuqs } from "@/features/automated-response/schemas/get-automated-responses-schema"
import type { SearchParams } from "nuqs/server"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = listAutomatedResponsesNuqs.parse(searchParams)

  const promises = Promise.all([
    getAutomatedResponses({
      ...search,
      chatbotId,
    }),
  ])

  return <AutomatedResponsesTable promises={promises} chatbotId={chatbotId} />
}
