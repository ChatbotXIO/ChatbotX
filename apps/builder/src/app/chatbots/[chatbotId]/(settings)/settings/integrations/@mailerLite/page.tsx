import { MailerLiteManage } from "@/features/integration-mailer-lite/mailer-lite-manage"
import { getMailerLiteIntegration } from "@/features/integration-mailer-lite/queries"

export default async function SettingIntegrationMailerLitePage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getMailerLiteIntegration(params.chatbotId)])

  return <MailerLiteManage chatbotId={params.chatbotId} promises={promises} />
}
