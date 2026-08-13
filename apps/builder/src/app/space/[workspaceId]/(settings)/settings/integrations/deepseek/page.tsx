import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { DeepSeekConnect } from "@/features/integration-deepseek/deepseek-connect"
import { findIntegrationDeepSeek } from "@/features/integration-deepseek/queries"

export default async function SettingsIntegrationDeepSeekPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const promises = Promise.all([findIntegrationDeepSeek({ workspaceId })])

  return <DeepSeekConnect promises={promises} />
}
