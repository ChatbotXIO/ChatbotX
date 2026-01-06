import { MailchimpManage } from "@/features/integration-mailchimp/components/mailchimp-manage"
import { getMailchimpIntegration } from "@/features/integration-mailchimp/queries"

type MailchimpSettingPageProps = {
  params: Promise<{
    chatbotId: string
  }>
}

export default async function MailchimpSettingPage({
  params,
}: MailchimpSettingPageProps) {
  const { chatbotId } = await params

  const promises = Promise.all([getMailchimpIntegration(chatbotId)])

  return <MailchimpManage chatbotId={chatbotId} promises={promises} />
}
