import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { getUrls } from "@aha.chat/integration-whatsapp/api/url"
import WhatsappEcommerce from "@/features/integration-whatsapp/components/whatsapp-ecommerce"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappEcommercePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params

  const integrationWhatsapp = await findIntegrationWhatsapp({ chatbotId, id })

  const urls = getUrls(integrationWhatsapp.auth as WhatsappAuthValue)

  return <WhatsappEcommerce urls={urls} />
}
