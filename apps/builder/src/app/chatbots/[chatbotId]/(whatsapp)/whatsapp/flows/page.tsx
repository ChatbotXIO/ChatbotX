import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { WhatsappFlowsTable } from "@/features/integration-whatsapp/flows/flows-table"
import { getWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { getWhatsappFlowsSearchParamsCache } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = getWhatsappFlowsSearchParamsCache.parse(searchParams)
  const promises = Promise.all([
    getWhatsappFlows({
      ...search,
      chatbotId,
      status: "",
    }),
  ])

  return (
    <div>
      <Suspense>
        <WhatsappFlowsTable chatbotId={chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
