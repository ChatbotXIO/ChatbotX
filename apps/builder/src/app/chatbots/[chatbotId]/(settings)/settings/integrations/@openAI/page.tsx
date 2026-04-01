import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { OpenAIConnect } from "@/features/integration-openai/openai-connect"
import { findIntegrationOpenAI } from "@/features/integration-openai/queries"

export default async function SettingIntegrationOpenAIPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationOpenAI({
      chatbotId,
    }),
  ])

  return <OpenAIConnect chatbotId={chatbotId} promises={promises} />
}
