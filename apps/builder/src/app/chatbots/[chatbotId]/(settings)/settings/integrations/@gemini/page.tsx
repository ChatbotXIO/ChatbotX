import { GeminiAIManage } from "@/features/integration-gemini/gemini-manage"
import { findIntegrationGemini } from "@/features/integration-gemini/queries"

export default async function SettingsIntegrationGeminiPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    findIntegrationGemini({
      chatbotId: params.chatbotId,
    }),
  ])

  return <GeminiAIManage promises={promises} />
}
