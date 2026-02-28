import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { WhatsappFlowsTable } from "@/features/integration-whatsapp/flows/flows-table"
import { listWhatsappFlows } from "@/features/integration-whatsapp/flows/queries"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappFlowsPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId, id } = await props.params

  const integrationWhatsapp = await findIntegrationWhatsapp({ chatbotId, id })

  const promises = Promise.all([
    listWhatsappFlows({
      chatbotId,
      id,
    }),
  ])

  return (
    <Suspense>
      <WhatsappFlowsTable
        integrationWhatsapp={integrationWhatsapp}
        promises={promises}
      />
    </Suspense>
  )
}
