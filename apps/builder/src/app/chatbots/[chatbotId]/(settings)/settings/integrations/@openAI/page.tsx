import { OpenAIConnect } from "@/features/integration-openai/openai-connect"
import { findIntegrationOpenAI } from "@/features/integration-openai/queries"
import { getAIAgents } from "@/features/integrations/ai-agents/queries/get.query"
import { getAITriggers } from "@/features/integrations/ai-triggers/queries"

export default async function SettingIntegrationGoogleSheetsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    findIntegrationOpenAI({
      chatbotId: params.chatbotId,
    }),
    getAIAgents({
      chatbotId: params.chatbotId,
    }),
    getAITriggers({
      chatbotId: params.chatbotId,
    }),
  ])

  return <OpenAIConnect chatbotId={params.chatbotId} promises={promises} />
}
