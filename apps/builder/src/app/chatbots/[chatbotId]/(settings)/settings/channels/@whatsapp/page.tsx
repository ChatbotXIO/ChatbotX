import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"
import { WhatsappConnect } from "@/features/integration-whatsapp/whatsapp-connect"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getWhastappIntegration({
      chatbotId: params.chatbotId,
    }),
  ])

  return <WhatsappConnect chatbotId={params.chatbotId} promises={promises} />
}
