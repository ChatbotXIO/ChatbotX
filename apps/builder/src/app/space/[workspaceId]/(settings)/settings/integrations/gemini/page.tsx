import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { GeminiAIManage } from "@/features/integration-gemini/gemini-manage"
import { findIntegrationGemini } from "@/features/integration-gemini/queries"

export default async function SettingsIntegrationGeminiPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationGemini({
      workspaceId,
    }),
  ])

  return <GeminiAIManage promises={promises} />
}
