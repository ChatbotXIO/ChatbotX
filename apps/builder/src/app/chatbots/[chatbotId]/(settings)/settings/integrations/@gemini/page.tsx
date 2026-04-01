import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { GeminiAIManage } from "@/features/integration-gemini/gemini-manage"
import { findIntegrationGemini } from "@/features/integration-gemini/queries"

export default async function SettingsIntegrationGeminiPage(props: {
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationGemini({
      chatbotId,
    }),
  ])

  return <GeminiAIManage promises={promises} />
}
