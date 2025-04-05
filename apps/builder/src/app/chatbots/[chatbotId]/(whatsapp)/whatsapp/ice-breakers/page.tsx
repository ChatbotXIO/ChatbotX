import { getIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"
import { IceBreakersList } from "@/features/integration-whatsapp/ice-breakers/ice-breaker-list"

export default async function WhatsappMessageTemplatePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const { chatbotId } = await props.params
  const promises = Promise.all([
    getIceBreakers({
      chatbotId,
    }),
  ])

  return <IceBreakersList promises={promises} chatbotId={chatbotId} />
}
