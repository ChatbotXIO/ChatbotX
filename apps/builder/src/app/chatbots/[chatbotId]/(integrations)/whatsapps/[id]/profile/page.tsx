import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { UpdateWhatsappProfile } from "@/features/integration-whatsapp/profile/update-whatsapp-profile"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  return <UpdateWhatsappProfile chatbotId={chatbotId} />
}
