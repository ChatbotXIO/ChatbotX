import OpenAIAssistantEdit from "@/features/integrations/open-ai/assistant/edit"
import {
  getOpenAIAssistantByID,
  getOpenAIModels,
  getOpenAITriggers,
} from "@/features/integrations/open-ai/queries"

export default async function OpenAIAssistantEditPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const params = await props.params
  const promises = Promise.all([
    getOpenAIAssistantByID({ id: params.id }),
    getOpenAITriggers(),
    getOpenAIModels(),
  ])

  return <OpenAIAssistantEdit promises={promises} />
}
