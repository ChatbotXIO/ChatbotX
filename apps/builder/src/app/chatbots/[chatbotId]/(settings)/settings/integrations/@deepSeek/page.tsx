import { DeepSeekConnect } from "@/features/integration-deepseek/deepseek-connect"
import { findIntegrationDeepSeek } from "@/features/integration-deepseek/queries"

export default async function SettingIntegrationDeepSeekPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    findIntegrationDeepSeek({
      chatbotId: params.chatbotId,
    }),
  ])

  return <DeepSeekConnect chatbotId={params.chatbotId} promises={promises} />
}
