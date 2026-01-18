import { KlaviyoManage } from "@/features/integration-klaviyo/klaviyo-manage"
import { getKlaviyoIntegration } from "@/features/integration-klaviyo/queries"

export default async function SettingIntegrationKlaviyoPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getKlaviyoIntegration(params.chatbotId)])

  return <KlaviyoManage chatbotId={params.chatbotId} promises={promises} />
}
