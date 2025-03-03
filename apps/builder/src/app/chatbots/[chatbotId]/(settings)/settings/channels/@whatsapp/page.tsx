import { getWhastappIntegration } from "@/features/integration-whatsapp/queries"
import { WhatsappManage } from "@/features/integration-whatsapp/whatsapp-manage"

export default async function SettingChannelWhatsappPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getWhastappIntegration({
      chatbotId: params.chatbotId,
    }),
  ])

  return <WhatsappManage chatbotId={params.chatbotId} promises={promises} />
}
