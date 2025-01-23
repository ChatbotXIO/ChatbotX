import {
  getOpenAIIntegration,
  getOpenAIAssistants,
} from "@/features/integrations/open-ai/queries"
import OpenAIAssistantTable from "@/features/integrations/open-ai/components/assistant/table"

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
