import OpenAIAssistantTable from "@/features/integrations/open-ai/assistant/table"
import {
  getOpenAIAssistants,
  getOpenAIIntegration,
} from "@/features/integrations/open-ai/queries"

export default async function OpenAIAssistantPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getOpenAIIntegration({ chatbotId: params.chatbotId as string }),
    getOpenAIAssistants({ chatbotId: params.chatbotId as string }),
  ])

  return <OpenAIAssistantTable promises={promises} />
}
