import { getWhatsappIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"
import { WhatsappIceBreakersList } from "@/features/integration-whatsapp/ice-breakers/ice-breaker-list"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params
  const promises = Promise.all([
    getWhatsappIceBreakers({
      chatbotId,
    }),
  ])

  return <WhatsappIceBreakersList promises={promises} chatbotId={chatbotId} />
}
