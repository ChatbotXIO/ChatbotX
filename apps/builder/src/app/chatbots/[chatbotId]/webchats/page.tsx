import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getIntegationWebchats } from "@/features/webchat/queries/get-webchats.query"
import { getWebchatRequest } from "@/features/webchat/schemas/webchat.schema"
import { WebchatTable } from "@/features/webchat/webchat-table"

export default async function WebchatsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getWebchatRequest.parse(searchParams)

  const promises = Promise.all([
    getIntegationWebchats({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <Suspense>
      <WebchatTable promises={promises} />
    </Suspense>
  )
}
