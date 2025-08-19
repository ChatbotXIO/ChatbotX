import { WhatsappIceBreakersList } from "@/features/integration-whatsapp/ice-breakers/ice-breaker-list"
import { getWhatsappIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params
  const promises = Promise.all([
    getWhatsappIceBreakers({
      chatbotId,
    }),
  ])

  return <WhatsappIceBreakersList chatbotId={chatbotId} promises={promises} />
}
