import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { getUrls } from "@chatbotx.io/integration-whatsapp/api/url"
import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import WhatsappUsefulLinks from "@/features/integration-whatsapp/components/whatsapp-useful-links"
import { findIntegrationWhatsapp } from "@/features/integration-whatsapp/queries"

export default async function WhatsappMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const { chatbotId: chatbotIdString, id: idString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }
  const id = parseBigIntId(idString)
  if (!id) {
    return notFound()
  }

  const integrationWhatsapp = await findIntegrationWhatsapp({ chatbotId, id })

  const urls = getUrls(integrationWhatsapp.auth as WhatsappAuthValue)

  return <WhatsappUsefulLinks urls={urls} />
}
