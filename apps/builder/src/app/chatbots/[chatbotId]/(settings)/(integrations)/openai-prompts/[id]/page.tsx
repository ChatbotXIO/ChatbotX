import OpenAIPromptEdit from "@/features/integrations/open-ai/components/prompt/edit"
import { getOpenAIPromptByID } from "@/features/integrations/open-ai/queries"

export default async function OpenAIPromptEditPage(props: {
  params: Promise<{ chatbotId: string; id: string }>
}) {
  const params = await props.params
  const promises = Promise.all([getOpenAIPromptByID({ id: params.id })])

  return <OpenAIPromptEdit promises={promises} />
}
