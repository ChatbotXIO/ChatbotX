import { WhatsappIceBreakerForm } from "@/features/integration-whatsapp/ice-breakers/ice-breaker-form"
import { getWhatsappIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"

export default async function CreateMessageTemplatePage({
  params,
}: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await params
  const promises = Promise.all([
    getWhatsappIceBreakers({
      chatbotId,
    }),
  ])

  return <WhatsappIceBreakerForm chatbotId={chatbotId} promises={promises} />
}
