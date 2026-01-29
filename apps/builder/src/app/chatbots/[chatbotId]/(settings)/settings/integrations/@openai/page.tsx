import { OpenAIConnect } from "@/features/integration-openai/openai-connect"
import { findIntegrationOpenAI } from "@/features/integration-openai/queries"

export default async function SettingIntegrationOpenAIPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    findIntegrationOpenAI({
      chatbotId: params.chatbotId,
    }),
  ])

  return <OpenAIConnect chatbotId={params.chatbotId} promises={promises} />
}
