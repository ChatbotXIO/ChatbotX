import { Suspense } from "react"
import { WhatsappMessageTemplatesTable } from "@/features/integration-whatsapp/message-templates/message-templates-table"
import { getMessageTemplates } from "@/features/integration-whatsapp/message-templates/queries"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await props.params

  const integrationWhatsapp = await findIntegrationWhatsapp({ chatbotId, id })

  const promises = getMessageTemplates({
    chatbotId,
    id,
  })

  return (
    <Suspense>
      <WhatsappMessageTemplatesTable
        integrationWhatsapp={integrationWhatsapp}
        promises={promises}
      />
    </Suspense>
  )
}
