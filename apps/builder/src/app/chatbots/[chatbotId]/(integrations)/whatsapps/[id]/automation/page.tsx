import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { findConversationalAutomation } from "@aha.chat/integration-whatsapp/api/phone-number"
import { WhatsappAutomationManage } from "@/features/integration-whatsapp/automation/whatsapp-automation-manage"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappIceBreakersPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await props.params

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
