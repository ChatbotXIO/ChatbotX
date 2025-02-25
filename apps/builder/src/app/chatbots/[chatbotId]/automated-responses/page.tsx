import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { getAutomatedResponses } from "@/features/automated-response/queries"
import { getAutomatedResponsesSearchParamsCache } from "@/features/automated-response/schemas/get-automated-responses-schema"
import { getTagsSearchParamsCache } from "@/features/tags/schemas/get-tags-schema"
import type { SearchParams } from "nuqs/server"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ])
  const { folderId } = getTagsSearchParamsCache.parse(searchParams)

  const search = getAutomatedResponsesSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getAutomatedResponses({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <AutomatedResponsesTable promises={promises} chatbotId={params.chatbotId} />
  )
}
