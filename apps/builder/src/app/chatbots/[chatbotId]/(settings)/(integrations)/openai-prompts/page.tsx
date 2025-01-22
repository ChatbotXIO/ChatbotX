import OpenAIPromptTable from "@/features/integrations/open-ai/components/prompt/table"
import {
  getOpenAIAgents,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"

export default async function OpenAIPromptsPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getOpenAIIntegration({ chatbotId: params.chatbotId as string }),
    getOpenAIAgents({ chatbotId: params.chatbotId as string }),
  ])

  return <OpenAIPromptTable promises={promises} />
}
