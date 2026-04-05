import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { findConversationalAutomation } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { notFound } from "next/navigation"
import { WhatsappAutomationManage } from "@/features/integration-whatsapp/automation/whatsapp-automation-manage"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappIceBreakersPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

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
