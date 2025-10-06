import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { getUrls } from "@aha.chat/integration-whatsapp/api/url"
import WhatsappUsefulLinks from "@/features/integration-whatsapp/components/whatsapp-useful-links"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId, id } = await params

  const integrationWhatsapp = await findIntegrationWhatsapp({
    where: { chatbotId, id },
  })

  const urls = getUrls(integrationWhatsapp.auth as unknown as WhatsappAuthValue)

  return <WhatsappUsefulLinks urls={urls} />
}
