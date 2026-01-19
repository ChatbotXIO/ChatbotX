import { getSendGridIntegration } from "@/features/integration-sendgrid/queries"
import { SendGridManage } from "@/features/integration-sendgrid/sendgrid-manage"

export default async function SettingIntegrationSendGridPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getSendGridIntegration(params.chatbotId)])

  return <SendGridManage chatbotId={params.chatbotId} promises={promises} />
}
