import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { findPhoneNumberDetail } from "@chatbotx.io/integration-whatsapp/api/phone-number"
import {
  findWaba,
  type WhatsappWabaMMLite,
} from "@chatbotx.io/integration-whatsapp/api/waba"
import { BUSINESS_URL } from "@chatbotx.io/integration-whatsapp/constants"
import { notFound } from "next/navigation"
import { WhatsappAccountHealths } from "@/features/integration-whatsapp/components/whatsapp-account-healths"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function WhatsappAccountHealthsPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({
    workspaceId: data.workspaceId,
    id: data.id,
  })

  const auth = integrationWhatsapp.auth as WhatsappAuthValue
  const phoneNumber = await findPhoneNumberDetail(auth)
  const waba: WhatsappWabaMMLite = await findWaba({
    wabaId: auth.metadata.wabaId,
    acessToken: auth.tokens.accessToken,
    fields: "marketing_messages_onboarding_status",
  })
  const businessManagerUrl = `${BUSINESS_URL}/wa/manage/home/?business_id=${auth.metadata.businessId}&waba_id=${auth.metadata.wabaId}`

  return (
    <WhatsappAccountHealths
      businessManagerUrl={businessManagerUrl}
      phoneNumber={phoneNumber}
      waba={waba}
      webhookUrl={auth.metadata.webhookUrl}
    />
  )
}
