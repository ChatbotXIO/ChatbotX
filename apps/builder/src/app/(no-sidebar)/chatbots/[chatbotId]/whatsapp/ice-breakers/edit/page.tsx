import { IceBreakerForm } from "@/features/integration-whatsapp/ice-breakers/ice-breaker-form"
import { getIceBreakers } from "@/features/integration-whatsapp/ice-breakers/queries"

export default async function CreateMessageTemplatePage({
  params,
}: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId } = await params
  const promises = Promise.all([
    getIceBreakers({
      chatbotId: chatbotId,
    }),
  ])

  return <IceBreakerForm chatbotId={chatbotId} promises={promises} />
}
