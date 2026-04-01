import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { findConversationalAutomation } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { WhatsappAutomationManage } from "@/features/integration-whatsapp/automation/whatsapp-automation-manage"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappIceBreakersPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId: chatbotIdString, id: idString } = await props.params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const id = parseBigIntId(idString)
  if (!id) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({ chatbotId, id })

  const promises = Promise.all([
    findConversationalAutomation(integrationWhatsapp.auth as WhatsappAuthValue),
  ])

  return (
    <WhatsappAutomationManage
      integrationWhatsapp={integrationWhatsapp}
      promises={promises}
    />
  )
}
