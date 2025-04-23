import { Suspense } from "react"
import type { SearchParams } from "nuqs/server"
import { FlowsTable } from "@/features/integration-whatsapp/flows/flows-table"
import { getFlows } from "@/features/integration-whatsapp/flows/queries"
import { getFlowsSearchParamsCache } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = getFlowsSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getFlows({
      ...search,
      chatbotId,
      status: "",
    }),
  ])

  return (
    <div>
      <Suspense>
        <FlowsTable promises={promises} chatbotId={chatbotId} />
      </Suspense>
    </div>
  )
}
