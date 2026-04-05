import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { OpenAIConnect } from "@/features/integration-openai/openai-connect"
import { findIntegrationOpenAI } from "@/features/integration-openai/queries"

export default async function SettingIntegrationOpenAIPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([
    findIntegrationOpenAI({
      workspaceId,
    }),
  ])

  return <OpenAIConnect promises={promises} workspaceId={workspaceId} />
}
