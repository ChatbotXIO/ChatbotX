import { OpenAIConnect } from "@/features/integrations/open-ai"
import { getOpenAIIntegration } from "@/features/integrations/open-ai/queries"

export default async function SettingIntegrationOpenAIPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getOpenAIIntegration({
      chatbotId: params.chatbotId,
    }),
  ])

  return <OpenAIConnect promises={promises} />
}
