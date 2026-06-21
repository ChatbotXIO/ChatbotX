import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { OpenRouterConnect } from "@/features/integration-openrouter/openrouter-connect"
import { findIntegrationOpenRouter } from "@/features/integration-openrouter/queries"

export default async function SettingsIntegrationOpenRouterPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([findIntegrationOpenRouter({ workspaceId })])

  return <OpenRouterConnect promises={promises} />
}
